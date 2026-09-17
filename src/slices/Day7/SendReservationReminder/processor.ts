import {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import cron, {ScheduledTask} from 'node-cron';
import {getKnexInstance} from '../../../common/db';
import {storeDlqMessage} from '../../../common/processorDlq';
import {
    RemindersDueReadModel,
    tableName as remindersDueTable,
    sortableStamp,
} from '../RemindersDue/RemindersDueProjection';
import {
    SendReservationReminderCommand,
    handleSendReservationReminder,
    streamNameFor,
} from './SendReservationReminderCommand';

const PROCESSOR_ID = 'sendreservationreminder-automation';

// A reminder window opening is the passing of time, not an event, so there is nothing for a
// reactor to subscribe to. This automation drains the RemindersDue list on a tick instead;
// every minute is fine because the row's own remindAt decides when it is due, not the tick.
// Sending removes the row, so a slow tick delays a reminder but never repeats one.
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

export const drainDueReminders = async (now: Date): Promise<void> => {
    const db = getKnexInstance();

    const due: RemindersDueReadModel[] = await db(remindersDueTable)
        .withSchema('public')
        .select(
            'reservation_code as reservationCode',
            'e_mail as eMail',
            'date',
            'start_time as startTime',
            'table_number as tableNumber',
            'remind_at as remindAt',
        )
        .where('remind_at_sortable', '<', sortableNow(now))
        .orderBy('remind_at_sortable');

    const sentAt = stampNow(now);

    for (const row of due) {
        const command: SendReservationReminderCommand = {
            type: 'SendReservationReminder',
            data: {
                reservationCode: row.reservationCode,
                eMail: row.eMail,
                date: row.date,
                startTime: row.startTime,
                tableNumber: row.tableNumber,
            },
            metadata: {
                sentAt,
                correlation_id: row.reservationCode,
                causation_id: row.reservationCode,
            },
        };

        try {
            await handleSendReservationReminder(row.eMail, command);
        } catch (err: any) {
            // The list is drained by a projection that runs after the append, so a row can
            // still be visible on the next tick — a repeat attempt is the expected outcome of
            // that race, not a failure worth a DLQ row. Same for a reservation the guest
            // cancelled in the meantime.
            if (err?.code === 'reminder_already_sent' || err?.code === 'reservation_cancelled') continue;

            console.error(`${PROCESSOR_ID}: failed to remind ${row.reservationCode}`, err);
            // There is no recorded trigger message to hand over — the trigger was a clock
            // tick — so the due row stands in for it, carrying the stream the append
            // targeted so the DLQ entry is still reprocessable.
            await storeDlqMessage(
                PROCESSOR_ID,
                {
                    type: 'SendReservationReminder',
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
            drainDueReminders(new Date()).catch(err =>
                console.error(`${PROCESSOR_ID} tick failed:`, err),
            );
        });
    },

    stop: async () => {
        await _task?.stop();
        _task = null;
    },
};
