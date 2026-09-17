import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {sql, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import {
    type ReservationCancelled,
    type ReservationConfirmed,
    type ReservationPlaced,
} from '../Day6Events';

export const tableName = 'day6_table_status';

export type TableStatusReadModel = {
    tableNumber: string | null;
    date: string;
    reservationCode: string;
    startTime: string;
    endTime: string;
    numberOfPeople: string;
};

export const getKnexInstance = (): Knex => knex({client: 'pg'});

type TableStatusEvents = ReservationPlaced | ReservationConfirmed | ReservationCancelled;

// ReservationPlaced is handled even though the board wires only Confirmed/Cancelled
// into this read model: numberOfPeople is mapped from ReservationPlaced and exists
// on no other event, so the row has to be seeded at placement time.
export const TableStatusProjection = postgreSQLRawSQLProjection<TableStatusEvents>({
    name: 'TableStatusProjection',
    canHandle: ['ReservationPlaced', 'ReservationConfirmed', 'ReservationCancelled'],
    evolve: async (event): Promise<SQL[]> => {
        const db = getKnexInstance();

        switch (event.type) {
            case 'ReservationPlaced':
                return [sql(db(tableName)
                    .withSchema('public')
                    .insert({
                        reservation_code: event.data.reservationCode,
                        table_number: null,
                        date: event.data.date,
                        start_time: event.data.startTime,
                        end_time: event.data.endTime,
                        number_of_people: event.data.numberOfPeople,
                    })
                    .onConflict('reservation_code')
                    .merge(['date', 'start_time', 'end_time', 'number_of_people'])
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

            // Cancelling frees the table: the reservation row goes, so the table
            // shows as free again and no longer blocks an overlapping confirmation.
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
