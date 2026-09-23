import {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import cron, {ScheduledTask} from 'node-cron';
import {getKnexInstance} from '../../../common/db';
import {storeDlqMessage} from '../../../common/processorDlq';
import {
    AutoSeatingCandidatesReadModel,
    tableName as autoSeatingCandidatesTable,
} from '../AutoSeatingCandidates/AutoSeatingCandidatesProjection';
import {
    HoldTableForReservationCommand,
    handleHoldTableForReservation,
    streamNameFor,
} from './HoldTableForReservationCommand';

const PROCESSOR_ID = 'holdtableforreservation-automation';

// A candidate becoming pickable is the state of a read model, not an event, so there is
// nothing for a reactor to subscribe to. This automation drains AutoSeatingCandidates on a
// tick instead, same pattern as SendReservationReminder polling RemindersDue.
const SCHEDULE = '* * * * *';

// There is no published table configuration in this system, so the walk is a fixed range
// rather than a lookup — the same limitation AutoSeatingCandidates itself works under.
const LOWEST_TABLE_NUMBER = 1;
const HIGHEST_TABLE_NUMBER = 20;

// A rejection here is the expected outcome of the walk, not a processing failure - only
// something else counts as an error worth a DLQ row.
const isExpectedRejection = (code: string | undefined): boolean =>
    code === 'table_blocked' || code === 'table_already_held' || code === 'hold_already_exists';

export const holdFirstFreeTable = async (row: AutoSeatingCandidatesReadModel): Promise<void> => {
    for (let tableNumber = LOWEST_TABLE_NUMBER; tableNumber <= HIGHEST_TABLE_NUMBER; tableNumber++) {
        const table = tableNumber.toString();

        const command: HoldTableForReservationCommand = {
            type: 'HoldTableForReservation',
            data: {
                reservationCode: row.reservationCode,
                tableNumber: table,
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
            await handleHoldTableForReservation(table, command);
            return;
        } catch (err: any) {
            if (isExpectedRejection(err?.code)) continue;

            console.error(`${PROCESSOR_ID}: failed to hold table ${table} for ${row.reservationCode}`, err);
            await storeDlqMessage(
                PROCESSOR_ID,
                {
                    type: 'HoldTableForReservation',
                    data: row,
                    metadata: {streamName: streamNameFor(table)},
                } as any,
                err,
            );
            return;
        }
    }
    // Every table rejected - the row stays Pending and staff seat the party manually.
};

export const drainPendingCandidates = async (): Promise<void> => {
    const db = getKnexInstance();

    const pending: AutoSeatingCandidatesReadModel[] = await db(autoSeatingCandidatesTable)
        .withSchema('public')
        .select(
            'reservation_code as reservationCode',
            'e_mail as eMail',
            'date',
            'start_time as startTime',
            'end_time as endTime',
            'number_of_people as numberOfPeople',
            'auto_seating_outcome as autoSeatingOutcome',
        )
        .where({auto_seating_outcome: 'Pending'})
        .orderBy('reservation_code');

    for (const row of pending) {
        await holdFirstFreeTable(row);
    }
};

let _task: ScheduledTask | null = null;

export const processor = {
    start: async (_eventStore: PostgresEventStore) => {
        _task = cron.schedule(SCHEDULE, () => {
            drainPendingCandidates().catch(err =>
                console.error(`${PROCESSOR_ID} tick failed:`, err),
            );
        });
    },

    stop: async () => {
        await _task?.stop();
        _task = null;
    },
};
