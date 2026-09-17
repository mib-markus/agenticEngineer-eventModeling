import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {sql, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import {
    type ReservationCancelled,
    type ReservationConfirmed,
    type ReservationReminderSent,
} from '../Day7Events';

export const tableName = 'day7_reminders_due';

export const REMINDER_LEAD_MINUTES = 120;

export type RemindersDueReadModel = {
    reservationCode: string;
    eMail: string;
    date: string;
    startTime: string;
    tableNumber: string;
    remindAt: string;
};

export const getKnexInstance = (): Knex => knex({client: 'pg'});

const DATE_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

const pad = (value: number): string => value.toString().padStart(2, '0');

// The threshold and `now` are both wall-clock readings, so they are projected into one
// fixed frame rather than a real timezone — correct across day/month/year boundaries
// without a date library.
const wallClock = (date: string, time: string): number | null => {
    const day = DATE_PATTERN.exec(date);
    const clock = TIME_PATTERN.exec(time);
    if (!day || !clock) return null;
    return Date.UTC(Number(day[3]), Number(day[2]) - 1, Number(day[1]), Number(clock[1]), Number(clock[2]));
};

// The board writes stamps as DD.MM.YYYY HH:MM, which is what the read model shows.
export const formatStamp = (epochMs: number): string => {
    const at = new Date(epochMs);
    return `${pad(at.getUTCDate())}.${pad(at.getUTCMonth() + 1)}.${at.getUTCFullYear()}`
        + ` ${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}`;
};

// DD.MM.YYYY HH:MM does not compare as text, so the same instant is stored a second time
// in sortable form and the "is it due yet" predicate stays a plain SQL comparison.
export const sortableStamp = (epochMs: number): string => {
    const at = new Date(epochMs);
    return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`
        + `T${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}`;
};

export const remindAt = (date: string, startTime: string): number | null => {
    const start = wallClock(date, startTime);
    return start === null ? null : start - REMINDER_LEAD_MINUTES * 60 * 1000;
};

type RemindersDueEvents = ReservationConfirmed | ReservationReminderSent | ReservationCancelled;

export const RemindersDueProjection = postgreSQLRawSQLProjection<RemindersDueEvents>({
    name: 'RemindersDueProjection',
    canHandle: ['ReservationConfirmed', 'ReservationReminderSent', 'ReservationCancelled'],
    evolve: async (event): Promise<SQL[]> => {
        const db = getKnexInstance();

        switch (event.type) {
            case 'ReservationConfirmed': {
                const window = remindAt(event.data.date, event.data.startTime);
                if (window === null) return [];

                return [sql(db(tableName)
                    .withSchema('public')
                    .insert({
                        reservation_code: event.data.reservationCode,
                        e_mail: event.data.eMail,
                        date: event.data.date,
                        start_time: event.data.startTime,
                        table_number: event.data.tableNumber,
                        remind_at: formatStamp(window),
                        remind_at_sortable: sortableStamp(window),
                    })
                    .onConflict('reservation_code')
                    .merge(['e_mail', 'date', 'start_time', 'table_number', 'remind_at', 'remind_at_sortable'])
                    .toQuery())];
            }

            // The emitted event closes back onto the list it was drained from, so a
            // reminded reservation is not offered to the automation a second time.
            case 'ReservationReminderSent':
            // A cancelled guest is not coming, so no reminder is owed.
            case 'ReservationCancelled':
                return [sql(db(tableName)
                    .withSchema('public')
                    .where({reservation_code: event.data.reservationCode})
                    .delete()
                    .toQuery())];

            default:
                return [];
        }
    },
});
