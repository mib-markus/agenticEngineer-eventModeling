import {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import cron, {ScheduledTask} from 'node-cron';
import {getKnexInstance} from '../../../common/db';
import {storeDlqMessage} from '../../../common/processorDlq';
import {
    HeldReservationsReadModel,
    tableName as heldReservationsTable,
} from '../HeldReservations/HeldReservationsProjection';
import {
    ConfirmHeldReservationCommand,
    handleConfirmHeldReservation,
    streamNameFor,
} from './ConfirmHeldReservationCommand';

const PROCESSOR_ID = 'confirmheldreservation-automation';

// A held reservation passing its second-step checks is the state of a read model, not an
// event, so there is nothing for a reactor to subscribe to. This automation drains
// HeldReservations on a tick instead, same pattern as HoldTableForReservation polling
// AutoSeatingCandidates.
const SCHEDULE = '* * * * *';

// A row already confirmed or released is the expected outcome of the drain racing the
// projection, not a processing failure - only something else counts as an error worth a
// DLQ row.
const isExpectedRejection = (code: string | undefined): boolean =>
    code === 'already_confirmed' || code === 'hold_already_released';

export const confirmHeldReservation = async (row: HeldReservationsReadModel): Promise<void> => {
    const command: ConfirmHeldReservationCommand = {
        type: 'ConfirmHeldReservation',
        data: {
            reservationCode: row.reservationCode,
            tableNumber: row.tableNumber,
            eMail: row.eMail,
            date: row.date,
            startTime: row.startTime,
            endTime: row.endTime,
        },
        metadata: {
            correlation_id: row.reservationCode,
            causation_id: row.reservationCode,
        },
    };

    try {
        await handleConfirmHeldReservation(row.tableNumber, command);
    } catch (err: any) {
        if (isExpectedRejection(err?.code)) return;

        console.error(`${PROCESSOR_ID}: failed to confirm ${row.reservationCode}`, err);
        await storeDlqMessage(
            PROCESSOR_ID,
            {
                type: 'ConfirmHeldReservation',
                data: row,
                metadata: {streamName: streamNameFor(row.tableNumber)},
            } as any,
            err,
        );
    }
};

export const drainHeldReservations = async (): Promise<void> => {
    const db = getKnexInstance();

    const held: HeldReservationsReadModel[] = await db(heldReservationsTable)
        .withSchema('public')
        .select(
            'reservation_code as reservationCode',
            'table_number as tableNumber',
            'e_mail as eMail',
            'date',
            'start_time as startTime',
            'end_time as endTime',
        )
        .orderBy('reservation_code');

    for (const row of held) {
        await confirmHeldReservation(row);
    }
};

let _task: ScheduledTask | null = null;

export const processor = {
    start: async (_eventStore: PostgresEventStore) => {
        _task = cron.schedule(SCHEDULE, () => {
            drainHeldReservations().catch(err =>
                console.error(`${PROCESSOR_ID} tick failed:`, err),
            );
        });
    },

    stop: async () => {
        await _task?.stop();
        _task = null;
    },
};
