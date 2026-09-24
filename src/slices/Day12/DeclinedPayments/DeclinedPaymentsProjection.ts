import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {sql, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import {type PaymentRequested, type PaymentDeclined} from '../Day12Events';

export const requestsTableName = 'day12_declined_payments_requests';
export const tableName = 'day12_declined_payments';

export type DeclinedPaymentsReadModel = {
    tableNumber: string;
    paymentId: string;
    orderNumber: string;
    totalAmount: string;
    tipAmount: string;
    declineReason: string;
    attemptCount: number;
    declinedAt: string;
};

export const getKnexInstance = (): Knex => knex({client: 'pg'});

type DeclinedPaymentsEvents = PaymentRequested | PaymentDeclined;

export const DeclinedPaymentsProjection = postgreSQLRawSQLProjection<DeclinedPaymentsEvents>({
    name: 'DeclinedPaymentsProjection',
    canHandle: ['PaymentRequested', 'PaymentDeclined'],
    evolve: async (event): Promise<SQL[]> => {
        const db = getKnexInstance();

        switch (event.type) {
            // A requested payment shows nothing yet ("No declines means nothing to show") -
            // it only stages the two money fields the visible row takes from
            // PaymentRequested once the decline is recorded.
            case 'PaymentRequested':
                return [sql(db(requestsTableName)
                    .withSchema('public')
                    .insert({
                        payment_id: event.data.paymentId,
                        total_amount: event.data.totalAmount,
                        tip_amount: event.data.tipAmount,
                    })
                    .onConflict('payment_id')
                    .merge(['total_amount', 'tip_amount'])
                    .toQuery())];

            // The decline was recorded: the row appears (or replaces the table's previous
            // one), joining the staged money fields onto this event's own fields.
            //
            // attemptCount is `aggregate:count(PaymentDeclined per orderNumber)`. The row is
            // keyed on tableNumber, so the increment has to be conditional: a decline on the
            // *same* orderNumber is another attempt on the same bill, while a decline on a
            // new orderNumber at that table is attempt 1 of a new bill.
            case 'PaymentDeclined': {
                const joined = db(`${requestsTableName} as r`)
                    .withSchema('public')
                    .where('r.payment_id', event.data.paymentId)
                    .select(
                        db.raw('? as table_number', [event.data.tableNumber]),
                        db.raw('? as payment_id', [event.data.paymentId]),
                        db.raw('? as order_number', [event.data.orderNumber]),
                        'r.total_amount',
                        'r.tip_amount',
                        db.raw('? as decline_reason', [event.data.declineReason]),
                        db.raw('1::integer as attempt_count'),
                        db.raw('?::timestamp as declined_at', [event.data.declinedAt]),
                    );

                return [sql(db(tableName)
                    .withSchema('public')
                    .insert(joined)
                    .onConflict('table_number')
                    .merge({
                        payment_id: db.raw('excluded.payment_id'),
                        order_number: db.raw('excluded.order_number'),
                        total_amount: db.raw('excluded.total_amount'),
                        tip_amount: db.raw('excluded.tip_amount'),
                        decline_reason: db.raw('excluded.decline_reason'),
                        attempt_count: db.raw(
                            `case when ${tableName}.order_number = excluded.order_number`
                            + ` then ${tableName}.attempt_count + 1 else 1 end`,
                        ),
                        declined_at: db.raw('excluded.declined_at'),
                    })
                    .toQuery())];
            }

            default:
                return [];
        }
    },
});
