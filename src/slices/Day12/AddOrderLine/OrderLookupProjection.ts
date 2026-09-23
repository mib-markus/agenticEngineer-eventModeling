import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {sql, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import {type OrderOpened} from '../Day12Events';

export const tableName = 'day12_order_lookup';

export const getKnexInstance = (): Knex => knex({client: 'pg'});

// Resolves orderNumber -> tableNumber so an order-number-only command can
// find the tableNumber-keyed stream it needs to replay. It answers "where
// does this order live", never "may this command proceed" — the
// preconditions stay in decide(), checked against the replayed events.
export const OrderLookupProjection = postgreSQLRawSQLProjection<OrderOpened>({
    name: 'OrderLookupProjection',
    canHandle: ['OrderOpened'],
    evolve: async (event): Promise<SQL[]> => {
        const db = getKnexInstance();

        return [sql(db(tableName)
            .withSchema('public')
            .insert({
                order_number: event.data.orderNumber,
                table_number: event.data.tableNumber,
            })
            .onConflict('order_number')
            .ignore()
            .toQuery())];
    },
});

export const findTableNumberByOrderNumber = async (
    db: Knex,
    orderNumber: string,
): Promise<string | null> => {
    const row = await db(tableName)
        .withSchema('public')
        .where({order_number: orderNumber})
        .select('table_number')
        .first();

    return row?.table_number ?? null;
};
