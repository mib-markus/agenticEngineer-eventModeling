import {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import cron, {ScheduledTask} from 'node-cron';
import {getKnexInstance} from '../../../common/db';
import {storeDlqMessage} from '../../../common/processorDlq';
import {
    HeldReservationsReadModel,
    tableName as heldReservationsTable,
} from '../HeldReservations/HeldReservationsProjection';
import {
    ReleaseTableHoldCommand,
    handleReleaseTableHold,
    streamNameFor,
} from './ReleaseTableHoldCommand';

const PROCESSOR_ID = 'releasetablehold-automation';

// The only release trigger this processor evaluates on its own - see slice.json's own
// mapping. Blacklist and upfront-payment reasons are staff decisions with no data source
// in this model, so the processor never derives them; it only passes through what a
// caller supplies via handleReleaseTableHold directly.
const OUTLIVED_REASON = 'The hold outlived its reservation window';

// A hold outliving its reservation window is the passing of time, not an event, so there
// is nothing for a reactor to subscribe to. This automation drains HeldReservations on a
// tick instead, same pattern as ConfirmHeldReservation polling the same read model.
const SCHEDULE = '* * * * *';

const DATE_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

// Same wall-clock derivation NoShowsDueProjection performs for its own grace-period
// check - projected into one fixed frame rather than a real timezone, correct across
// day/month/year boundaries without a date library.
const wallClock = (date: string, time: string): number | null => {
    const day = DATE_PATTERN.exec(date);
    const clock = TIME_PATTERN.exec(time);
    if (!day || !clock) return null;
    return Date.UTC(Number(day[3]), Number(day[2]) - 1, Number(day[1]), Number(clock[1]), Number(clock[2]));
};

// A row already released or its reservation already confirmed is the expected outcome of
// the drain racing the projection (or racing ConfirmHeldReservation's own drain of the
// same read model), not a processing failure worth a DLQ row.
const isExpectedRejection = (code: string | undefined): boolean =>
    code === 'hold_already_released' || code === 'reservation_already_confirmed';

export const releaseOutlivedHold = async (row: HeldReservationsReadModel): Promise<void> => {
    const command: ReleaseTableHoldCommand = {
        type: 'ReleaseTableHold',
        data: {
            tableNumber: row.tableNumber,
            reservationCode: row.reservationCode,
            date: row.date,
            startTime: row.startTime,
            endTime: row.endTime,
            reason: OUTLIVED_REASON,
        },
        metadata: {
            correlation_id: row.reservationCode,
            causation_id: row.reservationCode,
        },
    };

    try {
        await handleReleaseTableHold(row.tableNumber, command);
    } catch (err: any) {
        if (isExpectedRejection(err?.code)) return;

        console.error(`${PROCESSOR_ID}: failed to release ${row.reservationCode}`, err);
        await storeDlqMessage(
            PROCESSOR_ID,
            {
                type: 'ReleaseTableHold',
                data: row,
                metadata: {streamName: streamNameFor(row.tableNumber)},
            } as any,
            err,
        );
    }
};

export const drainOutlivedHolds = async (now: Date): Promise<void> => {
    const db = getKnexInstance();
    const nowMs = now.getTime();

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
        const windowEnd = wallClock(row.date, row.endTime);
        if (windowEnd === null || windowEnd >= nowMs) continue;

        await releaseOutlivedHold(row);
    }
};

let _task: ScheduledTask | null = null;

export const processor = {
    start: async (_eventStore: PostgresEventStore) => {
        _task = cron.schedule(SCHEDULE, () => {
            drainOutlivedHolds(new Date()).catch(err =>
                console.error(`${PROCESSOR_ID} tick failed:`, err),
            );
        });
    },

    stop: async () => {
        await _task?.stop();
        _task = null;
    },
};
