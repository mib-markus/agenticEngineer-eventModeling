import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {sql, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import {type OrderPaid, type TableClosed} from '../Day12Events';

export const tableName = 'day12_tables_ready_to_close';

export type TablesReadyToCloseReadModel = {
    orderNumber: string;
    tableNumber: string;
    amountPaid: string;
    paidAt: string;
};

export const getKnexInstance = (): Knex => knex({client: 'pg'});

type TablesReadyToCloseEvents = OrderPaid | TableClosed;

export const TablesReadyToCloseProjection = postgreSQLRawSQLProjection<TablesReadyToCloseEvents>({
    name: 'TablesReadyToCloseProjection',
    canHandle: ['OrderPaid', 'TableClosed'],
    evolve: async (event): Promise<SQL[]> => {
        const db = getKnexInstance();

        switch (event.type) {
            case 'OrderPaid':
                return [sql(db(tableName)
                    .withSchema('public')
                    .insert({
                        order_number: event.data.orderNumber,
                        table_number: event.data.tableNumber,
                        amount_paid: event.data.amountPaid,
                        paid_at: event.data.paidAt,
                    })
                    .onConflict('order_number')
                    .merge(['table_number', 'amount_paid', 'paid_at'])
                    .toQuery())];

            // The table has been closed - it leaves the ready-to-close list.
            case 'TableClosed':
                return [sql(db(tableName)
                    .withSchema('public')
                    .where({order_number: event.data.orderNumber})
                    .delete()
                    .toQuery())];

            default:
                return [];
        }
    },
});
