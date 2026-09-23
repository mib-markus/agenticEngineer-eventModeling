import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {sql, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import {
    type TableHeldForReservation,
    type ReservationConfirmed,
    type TableHoldReleased,
} from '../Day7Events';

export const tableName = 'day7_held_reservations';

export type HeldReservationsReadModel = {
    reservationCode: string;
    tableNumber: string;
    eMail: string;
    date: string;
    startTime: string;
    endTime: string;
};

export const getKnexInstance = (): Knex => knex({client: 'pg'});

type HeldReservationsEvents = TableHeldForReservation | ReservationConfirmed | TableHoldReleased;

export const HeldReservationsProjection = postgreSQLRawSQLProjection<HeldReservationsEvents>({
    name: 'HeldReservationsProjection',
    canHandle: ['TableHeldForReservation', 'ReservationConfirmed', 'TableHoldReleased'],
    evolve: async (event): Promise<SQL[]> => {
        const db = getKnexInstance();

        switch (event.type) {
            case 'TableHeldForReservation':
                return [sql(db(tableName)
                    .withSchema('public')
                    .insert({
                        reservation_code: event.data.reservationCode,
                        table_number: event.data.tableNumber,
                        e_mail: event.data.eMail,
                        date: event.data.date,
                        start_time: event.data.startTime,
                        end_time: event.data.endTime,
                    })
                    .onConflict('reservation_code')
                    .merge(['table_number', 'e_mail', 'date', 'start_time', 'end_time'])
                    .toQuery())];

            // Checks passed - the hold turned into a confirmed seating and leaves the queue.
            case 'ReservationConfirmed':
                return [sql(db(tableName)
                    .withSchema('public')
                    .where({reservation_code: event.data.reservationCode})
                    .delete()
                    .toQuery())];

            // Checks failed - the hold was given back and leaves the queue.
            case 'TableHoldReleased':
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
