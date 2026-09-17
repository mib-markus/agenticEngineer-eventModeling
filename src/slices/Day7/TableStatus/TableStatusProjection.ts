import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {sql, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import {
    type ReservationCancelled,
    type ReservationConfirmed,
    type ReservationPlaced,
    type ReservationReleasedAsNoShow,
    type TableBlocked,
} from '../Day7Events';

export const tableName = 'day7_table_status';

export type TableStatusReadModel = {
    tableNumber: string | null;
    date: string;
    reservationCode: string;
    startTime: string;
    endTime: string;
    numberOfPeople: string | null;
};

export const getKnexInstance = (): Knex => knex({client: 'pg'});

// A block has no reservation code, but the row still needs a stable key. Deriving it
// from the table, day and window means a redelivered TableBlocked overwrites its own
// row instead of adding a second one.
export const blockCodeFor = (data: {tableNumber: string; date: string; startTime: string; endTime: string}) =>
    `BLOCK-${data.tableNumber}-${data.date}-${data.startTime}-${data.endTime}`;

type TableStatusEvents =
    | ReservationPlaced
    | ReservationConfirmed
    | ReservationCancelled
    | TableBlocked
    | ReservationReleasedAsNoShow;

// ReservationPlaced is handled even though the board wires only Confirmed/Cancelled
// into this read model: numberOfPeople is mapped from ReservationPlaced and exists
// on no other event, so the row has to be seeded at placement time.
export const TableStatusProjection = postgreSQLRawSQLProjection<TableStatusEvents>({
    name: 'Day7TableStatusProjection',
    canHandle: [
        'ReservationPlaced',
        'ReservationConfirmed',
        'ReservationCancelled',
        'TableBlocked',
        'ReservationReleasedAsNoShow',
    ],
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

            // A block occupies the table with no guest behind it, which is what stops
            // ConfirmReservation seating someone on a table that is out of service.
            case 'TableBlocked':
                return [sql(db(tableName)
                    .withSchema('public')
                    .insert({
                        reservation_code: blockCodeFor(event.data),
                        table_number: event.data.tableNumber,
                        date: event.data.date,
                        start_time: event.data.startTime,
                        end_time: event.data.endTime,
                        number_of_people: null,
                    })
                    .onConflict('reservation_code')
                    .merge(['table_number', 'date', 'start_time', 'end_time'])
                    .toQuery())];

            // Cancelling frees the table: the reservation row goes, so the table
            // shows as free again and no longer blocks an overlapping confirmation.
            case 'ReservationCancelled':
            // Releasing a no-show frees the table the same way — that release is the
            // whole point of the grace period, so the table has to become bookable.
            case 'ReservationReleasedAsNoShow':
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
