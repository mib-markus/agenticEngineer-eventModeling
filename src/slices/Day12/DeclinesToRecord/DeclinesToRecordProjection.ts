import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {sql, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import {type PaymentRequested, type AuthorizationDeclined} from '../Day12Events';

export const requestsTableName = 'day12_declines_to_record_requests';
export const tableName = 'day12_declines_to_record';

export type DeclinesToRecordReadModel = {
    paymentId: string;
    orderNumber: string;
    tableNumber: string;
    totalAmount: string;
    declineReason: string;
    declineCode: string;
    maskedCardNumber: string;
    declinedAt: string;
};

export const getKnexInstance = (): Knex => knex({client: 'pg'});

type DeclinesToRecordEvents = PaymentRequested | AuthorizationDeclined;

export const DeclinesToRecordProjection = postgreSQLRawSQLProjection<DeclinesToRecordEvents>({
    name: 'DeclinesToRecordProjection',
    canHandle: ['PaymentRequested', 'AuthorizationDeclined'],
    evolve: async (event): Promise<SQL[]> => {
        const db = getKnexInstance();

        switch (event.type) {
            // A requested payment is not a todo yet - it only stages the order/money
            // fields the visible row needs once the provider declines.
            case 'PaymentRequested':
                return [sql(db(requestsTableName)
                    .withSchema('public')
                    .insert({
                        payment_id: event.data.paymentId,
                        order_number: event.data.orderNumber,
                        table_number: event.data.tableNumber,
                        total_amount: event.data.totalAmount,
                    })
                    .onConflict('payment_id')
                    .merge(['order_number', 'table_number', 'total_amount'])
                    .toQuery())];

            // The provider declined: the todo appears, joining this event's decline fields
            // onto the staged request. cardBrand is deliberately not projected - the read
            // model's fields[] omits it.
            case 'AuthorizationDeclined': {
                const joined = db(`${requestsTableName} as r`)
                    .withSchema('public')
                    .where('r.payment_id', event.data.paymentId)
                    .select(
                        'r.payment_id',
                        'r.order_number',
                        'r.table_number',
                        'r.total_amount',
                        db.raw('? as decline_reason', [event.data.declineReason]),
                        db.raw('? as decline_code', [event.data.declineCode]),
                        db.raw('? as masked_card_number', [event.data.maskedCardNumber]),
                        db.raw('?::timestamp as declined_at', [event.data.declinedAt]),
                    );

                return [sql(db(tableName)
                    .withSchema('public')
                    .insert(joined)
                    .onConflict('payment_id')
                    .merge([
                        'order_number',
                        'table_number',
                        'total_amount',
                        'decline_reason',
                        'decline_code',
                        'masked_card_number',
                        'declined_at',
                    ])
                    .toQuery())];
            }

            default:
                return [];
        }
    },
});
