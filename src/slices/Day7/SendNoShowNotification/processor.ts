import {randomUUID} from 'node:crypto';
import {PostgresEventStore, PostgreSQLEventStoreConsumer} from '@event-driven-io/emmett-postgresql';
import {type ReservationReleasedAsNoShow} from '../Day7Events';
import {
    SendNoShowNotificationCommand,
    handleSendNoShowNotification,
} from './SendNoShowNotificationCommand';
import {storeDlqMessage} from '../../../common/processorDlq';

const PROCESSOR_ID = 'sendnoshownotification-automation';

const pad = (value: number): string => value.toString().padStart(2, '0');

const stampNow = (now: Date): string =>
    `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`
    + ` ${pad(now.getHours())}:${pad(now.getMinutes())}`;

let _consumer: PostgreSQLEventStoreConsumer<ReservationReleasedAsNoShow> | null = null;

// The queue this drains has no time threshold — a row is due the moment the release
// happens — so unlike ReleaseNoShowReservation this automation reacts to the event
// rather than polling.
export const processor = {
    start: async (eventStore: PostgresEventStore) => {
        _consumer = eventStore.consumer<ReservationReleasedAsNoShow>();

        _consumer.reactor<ReservationReleasedAsNoShow>({
            processorId: PROCESSOR_ID,
            processorInstanceId: randomUUID(),
            canHandle: ['ReservationReleasedAsNoShow'],
            lock: {
                timeoutSeconds: 30,
                acquisitionPolicy: {type: 'retry', retries: 60, minTimeout: 1000, maxTimeout: 2000},
            },
            eachMessage: async (message) => {
                try {
                    const command: SendNoShowNotificationCommand = {
                        type: 'SendNoShowNotification',
                        data: {
                            reservationCode: message.data.reservationCode,
                            eMail: message.data.eMail,
                            date: message.data.date,
                            startTime: message.data.startTime,
                        },
                        metadata: {
                            sentAt: stampNow(new Date()),
                            correlation_id: message.data.reservationCode,
                            causation_id: message.metadata?.correlation_id,
                        },
                    };

                    await handleSendNoShowNotification(message.data.eMail, command);
                } catch (err: any) {
                    // A redelivery of an already-notified release is the expected outcome of
                    // at-least-once delivery, not a failure worth a DLQ row.
                    if (err?.code === 'notification_already_sent') return;

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
