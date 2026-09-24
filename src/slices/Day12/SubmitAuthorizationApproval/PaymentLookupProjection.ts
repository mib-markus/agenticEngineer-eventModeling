import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {sql, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import {type PaymentRequested} from '../Day12Events';

export const tableName = 'day12_payment_lookup';

export const getKnexInstance = (): Knex => knex({client: 'pg'});

// Resolves paymentId -> tableNumber so the payment provider's callback commands,
// which carry only the paymentId, can find the Day12-table-{tableNumber} stream
// their matching PaymentRequested lives on. Same role as OrderLookupProjection:
// it answers "where does this payment live", never "may this callback proceed" —
// the preconditions stay in decide(), checked against the replayed events.
export const PaymentLookupProjection = postgreSQLRawSQLProjection<PaymentRequested>({
    name: 'PaymentLookupProjection',
    canHandle: ['PaymentRequested'],
    evolve: async (event): Promise<SQL[]> => {
        const db = getKnexInstance();

        return [sql(db(tableName)
            .withSchema('public')
            .insert({
                payment_id: event.data.paymentId,
                table_number: event.data.tableNumber,
                order_number: event.data.orderNumber,
            })
            .onConflict('payment_id')
            .ignore()
            .toQuery())];
    },
});

export type PaymentLocation = {
    tableNumber: string;
    orderNumber: string;
};

export const findPaymentLocation = async (
    db: Knex,
    paymentId: string,
): Promise<PaymentLocation | null> => {
    const row = await db(tableName)
        .withSchema('public')
        .where({payment_id: paymentId})
        .select('table_number', 'order_number')
        .first();

    if (!row) return null;
    return {tableNumber: row.table_number, orderNumber: row.order_number};
};
