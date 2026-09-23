import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {sql, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import {type TableClosed, type TableFreedForReassignment} from '../Day12Events';

export const tableName = 'day12_tables_to_clean';

export type TablesToCleanReadModel = {
    tableNumber: string;
    orderNumber: string;
    closedAt: string;
};

export const getKnexInstance = (): Knex => knex({client: 'pg'});

type TablesToCleanEvents = TableClosed | TableFreedForReassignment;

export const TablesToCleanProjection = postgreSQLRawSQLProjection<TablesToCleanEvents>({
    name: 'TablesToCleanProjection',
    canHandle: ['TableClosed', 'TableFreedForReassignment'],
    evolve: async (event): Promise<SQL[]> => {
        const db = getKnexInstance();

        switch (event.type) {
            case 'TableClosed':
                return [sql(db(tableName)
                    .withSchema('public')
                    .insert({
                        table_number: event.data.tableNumber,
                        order_number: event.data.orderNumber,
                        closed_at: event.data.closedAt,
                    })
                    .onConflict('table_number')
                    .merge(['order_number', 'closed_at'])
                    .toQuery())];

            // The table has been cleaned and freed for reassignment - it leaves the cleaning list.
            case 'TableFreedForReassignment':
                return [sql(db(tableName)
                    .withSchema('public')
                    .where({table_number: event.data.tableNumber})
                    .delete()
                    .toQuery())];

            default:
                return [];
        }
    },
});
