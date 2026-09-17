import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {sql, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import {type TableBlocked} from '../Day7Events';

export const tableName = 'day7_table_blocks';

export type TableBlocksReadModel = {
    tableNumber: string;
    date: string;
    startTime: string;
    endTime: string;
    reason: string;
};

export const getKnexInstance = (): Knex => knex({client: 'pg'});

export const TableBlocksProjection = postgreSQLRawSQLProjection<TableBlocked>({
    name: 'TableBlocksProjection',
    canHandle: ['TableBlocked'],
    evolve: async (event): Promise<SQL[]> => {
        const db = getKnexInstance();

        switch (event.type) {
            case 'TableBlocked':
                return [sql(db(tableName)
                    .withSchema('public')
                    .insert({
                        table_number: event.data.tableNumber,
                        date: event.data.date,
                        start_time: event.data.startTime,
                        end_time: event.data.endTime,
                        reason: event.data.reason,
                    })
                    .onConflict(['table_number', 'date', 'start_time', 'end_time'])
                    .merge(['reason'])
                    .toQuery())];

            default:
                return [];
        }
    },
});
