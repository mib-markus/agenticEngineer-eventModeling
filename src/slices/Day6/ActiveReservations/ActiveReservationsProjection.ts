import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {sql, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import {
    type ReservationCancelled,
    type ReservationConfirmed,
    type ReservationPlaced,
} from '../Day6Events';

export const tableName = 'day6_active_reservations';

export type ActiveReservationsReadModel = {
    reservationCode: string;
    eMail: string;
    date: string;
    startTime: string;
    endTime: string;
    numberOfPeople: string;
    tableNumber: string | null;
};

export const getKnexInstance = (): Knex => knex({client: 'pg'});

type ActiveReservationsEvents = ReservationPlaced | ReservationConfirmed | ReservationCancelled;

export const ActiveReservationsProjection = postgreSQLRawSQLProjection<ActiveReservationsEvents>({
    name: 'ActiveReservationsProjection',
    canHandle: ['ReservationPlaced', 'ReservationConfirmed', 'ReservationCancelled'],
    evolve: async (event): Promise<SQL[]> => {
        const db = getKnexInstance();

        switch (event.type) {
            case 'ReservationPlaced':
                return [sql(db(tableName)
                    .withSchema('public')
                    .insert({
                        reservation_code: event.data.reservationCode,
                        e_mail: event.data.eMail,
                        date: event.data.date,
                        start_time: event.data.startTime,
                        end_time: event.data.endTime,
                        number_of_people: event.data.numberOfPeople,
                        table_number: null,
                    })
                    .onConflict('reservation_code')
                    .merge(['e_mail', 'date', 'start_time', 'end_time', 'number_of_people'])
                    .toQuery())];

            case 'ReservationConfirmed':
                return [sql(db(tableName)
                    .withSchema('public')
                    .where({reservation_code: event.data.reservationCode})
                    .update({
                        table_number: event.data.tableNumber,
                        date: event.data.date,
                        start_time: event.data.startTime,
                        end_time: event.data.endTime,
                    })
                    .toQuery())];

            // "Active" is the whole point of this list, so a cancelled reservation
            // leaves it rather than staying on with a status field.
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
