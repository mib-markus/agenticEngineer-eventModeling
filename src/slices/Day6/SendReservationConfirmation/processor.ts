import {randomUUID} from 'node:crypto';
import {PostgresEventStore, PostgreSQLEventStoreConsumer} from '@event-driven-io/emmett-postgresql';
import {type ReservationPlaced} from '../Day6Events';
import {
    SendReservationConfirmationCommand,
    handleSendReservationConfirmation,
} from './SendReservationConfirmationCommand';
import {storeDlqMessage} from '../../../common/processorDlq';

const PROCESSOR_ID = 'sendreservationconfirmation-automation';

const pad = (value: number): string => value.toString().padStart(2, '0');

// The board's example sentAt is `10.09.2026 14:32`, so the stamp is formatted to match
// the rest of Day6's DD.MM.YYYY HH:MM strings rather than as an ISO timestamp.
const stampNow = (now: Date): string =>
    `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`
    + ` ${pad(now.getHours())}:${pad(now.getMinutes())}`;

let _consumer: PostgreSQLEventStoreConsumer<ReservationPlaced> | null = null;

export const processor = {
    start: async (eventStore: PostgresEventStore) => {
        _consumer = eventStore.consumer<ReservationPlaced>();

        _consumer.reactor<ReservationPlaced>({
            processorId: PROCESSOR_ID,
            processorInstanceId: randomUUID(),
            canHandle: ['ReservationPlaced'],
            lock: {
                timeoutSeconds: 30,
                acquisitionPolicy: {type: 'retry', retries: 60, minTimeout: 1000, maxTimeout: 2000},
            },
            eachMessage: async (message) => {
                try {
                    const command: SendReservationConfirmationCommand = {
                        type: 'SendReservationConfirmation',
                        data: {
                            reservationCode: message.data.reservationCode,
                            eMail: message.data.eMail,
                            date: message.data.date,
                            startTime: message.data.startTime,
                            endTime: message.data.endTime,
                            numberOfPeople: message.data.numberOfPeople,
                        },
                        metadata: {
                            sentAt: stampNow(new Date()),
                            correlation_id: message.data.reservationCode,
                            causation_id: message.metadata?.correlation_id,
                        },
                    };

                    await handleSendReservationConfirmation(message.data.eMail, command);
                } catch (err: any) {
                    // A redelivery of an already-confirmed reservation is the expected
                    // outcome of at-least-once delivery, not a failure worth a DLQ row.
                    if (err?.code === 'confirmation_already_sent') return;

                    console.error(`${PROCESSOR_ID}: failed to process message`, message.data, err);
                    await storeDlqMessage(PROCESSOR_ID, message, err);
                }
            },
        });

        _consumer?.start().catch(err =>
            console.error(`${PROCESSOR_ID} consumer error:`, err),
        );
    },

    stop: async () => {
        await _consumer?.stop();
    },
};
