import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {sql, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import {type ReservationConfirmed} from '../Day12Events';

export const tableName = 'day12_tables_to_serve';

export type TablesToServeReadModel = {
    date: string;
    tableNumber: string;
    reservationCode: string;
    startTime: string;
    endTime: string;
};

export const getKnexInstance = (): Knex => knex({client: 'pg'});

export const TablesToServeProjection = postgreSQLRawSQLProjection<ReservationConfirmed>({
    name: 'TablesToServeProjection',
    canHandle: ['ReservationConfirmed'],
    evolve: async (event): Promise<SQL[]> => {
        const db = getKnexInstance();

        switch (event.type) {
            case 'ReservationConfirmed':
                return [sql(db(tableName)
                    .withSchema('public')
                    .insert({
                        reservation_code: event.data.reservationCode,
                        table_number: event.data.tableNumber,
                        date: event.data.date,
                        start_time: event.data.startTime,
                        end_time: event.data.endTime,
                    })
                    .onConflict('reservation_code')
                    .merge(['table_number', 'date', 'start_time', 'end_time'])
                    .toQuery())];

            default:
                return [];
        }
    },
});
