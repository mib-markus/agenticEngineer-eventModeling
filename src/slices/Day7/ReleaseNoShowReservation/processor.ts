import {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import cron, {ScheduledTask} from 'node-cron';
import {getKnexInstance} from '../../../common/db';
import {storeDlqMessage} from '../../../common/processorDlq';
import {
    NoShowsDueReadModel,
    tableName as noShowsDueTable,
    sortableStamp,
} from '../NoShowsDue/NoShowsDueProjection';
import {
    ReleaseNoShowReservationCommand,
    handleReleaseNoShowReservation,
    streamNameFor,
} from './ReleaseNoShowReservationCommand';

const PROCESSOR_ID = 'releasenoshowreservation-automation';

// A grace period expiring is the passing of time, not an event, so there is nothing for a
// reactor to subscribe to. This automation drains the NoShowsDue list on a tick instead;
// every minute is fine because the row's own graceEndsAt decides when it is due, not the
// tick. Releasing removes the row, so a slow tick delays a release but never repeats one.
const SCHEDULE = '* * * * *';

const pad = (value: number): string => value.toString().padStart(2, '0');

const stampNow = (now: Date): string =>
    `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`
    + ` ${pad(now.getHours())}:${pad(now.getMinutes())}`;

const sortableNow = (now: Date): string =>
    sortableStamp(Date.UTC(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours(),
        now.getMinutes(),
    ));

export const drainDueNoShows = async (now: Date): Promise<void> => {
    const db = getKnexInstance();

    const due: NoShowsDueReadModel[] = await db(noShowsDueTable)
        .withSchema('public')
        .select(
            'reservation_code as reservationCode',
            'e_mail as eMail',
            'date',
            'start_time as startTime',
            'table_number as tableNumber',
            'grace_ends_at as graceEndsAt',
        )
        .where('grace_ends_at_sortable', '<', sortableNow(now))
        .orderBy('grace_ends_at_sortable');

    const releasedAt = stampNow(now);

    for (const row of due) {
        const command: ReleaseNoShowReservationCommand = {
            type: 'ReleaseNoShowReservation',
            data: {
                reservationCode: row.reservationCode,
                eMail: row.eMail,
                date: row.date,
                startTime: row.startTime,
                tableNumber: row.tableNumber,
            },
            metadata: {
                releasedAt,
                correlation_id: row.reservationCode,
                causation_id: row.reservationCode,
            },
        };

        try {
            await handleReleaseNoShowReservation(row.eMail, command);
        } catch (err: any) {
            // The list is drained by a projection that runs after the append, so a row can
            // still be visible on the next tick — a repeat release attempt is the expected
            // outcome of that race, not a failure worth a DLQ row. Same for a reservation
            // the guest cancelled in the meantime.
            if (err?.code === 'already_released' || err?.code === 'reservation_cancelled') continue;

            console.error(`${PROCESSOR_ID}: failed to release ${row.reservationCode}`, err);
            // There is no recorded trigger message to hand over — the trigger was a clock
            // tick — so the due row stands in for it, carrying the stream the append
            // targeted so the DLQ entry is still reprocessable.
            await storeDlqMessage(
                PROCESSOR_ID,
                {
                    type: 'ReleaseNoShowReservation',
                    data: row,
                    metadata: {streamName: streamNameFor(row.eMail)},
                } as any,
                err,
            );
        }
    }
};

let _task: ScheduledTask | null = null;

export const processor = {
    start: async (_eventStore: PostgresEventStore) => {
        _task = cron.schedule(SCHEDULE, () => {
            drainDueNoShows(new Date()).catch(err =>
                console.error(`${PROCESSOR_ID} tick failed:`, err),
            );
        });
    },

    stop: async () => {
        await _task?.stop();
        _task = null;
    },
};
