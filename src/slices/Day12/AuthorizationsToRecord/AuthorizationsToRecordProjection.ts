import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {sql, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import {type PaymentRequested, type AuthorizationApproved} from '../Day12Events';

export const requestsTableName = 'day12_authorizations_to_record_requests';
export const tableName = 'day12_authorizations_to_record';

export type AuthorizationsToRecordReadModel = {
    paymentId: string;
    orderNumber: string;
    tableNumber: string;
    totalAmount: string;
    tipAmount: string;
    paymentType: string;
    authorizationCode: string;
    cardBrand: string;
    maskedCardNumber: string;
    approvedAt: string;
};

export const getKnexInstance = (): Knex => knex({client: 'pg'});

type AuthorizationsToRecordEvents = PaymentRequested | AuthorizationApproved;

export const AuthorizationsToRecordProjection = postgreSQLRawSQLProjection<AuthorizationsToRecordEvents>({
    name: 'AuthorizationsToRecordProjection',
    canHandle: ['PaymentRequested', 'AuthorizationApproved'],
    evolve: async (event): Promise<SQL[]> => {
        const db = getKnexInstance();

        switch (event.type) {
            // A requested payment is not a todo yet - it only stages the order/money
            // fields the visible row needs once the provider answers.
            case 'PaymentRequested':
                return [sql(db(requestsTableName)
                    .withSchema('public')
                    .insert({
                        payment_id: event.data.paymentId,
                        order_number: event.data.orderNumber,
                        table_number: event.data.tableNumber,
                        total_amount: event.data.totalAmount,
                        tip_amount: event.data.tipAmount,
                        payment_type: event.data.paymentType,
                    })
                    .onConflict('payment_id')
                    .merge(['order_number', 'table_number', 'total_amount', 'tip_amount', 'payment_type'])
                    .toQuery())];

            // The provider approved: the todo appears, joining this event's card fields
            // onto the staged request. A paymentId with no staged request selects no rows,
            // so nothing is written.
            case 'AuthorizationApproved': {
                const joined = db(`${requestsTableName} as r`)
                    .withSchema('public')
                    .where('r.payment_id', event.data.paymentId)
                    .select(
                        'r.payment_id',
                        'r.order_number',
                        'r.table_number',
                        'r.total_amount',
                        'r.tip_amount',
                        'r.payment_type',
                        db.raw('? as authorization_code', [event.data.authorizationCode]),
                        db.raw('? as card_brand', [event.data.cardBrand]),
                        db.raw('? as masked_card_number', [event.data.maskedCardNumber]),
                        db.raw('?::timestamp as approved_at', [event.data.approvedAt]),
                    );

                return [sql(db(tableName)
                    .withSchema('public')
                    .insert(joined)
                    .onConflict('payment_id')
                    .merge([
                        'order_number',
                        'table_number',
                        'total_amount',
                        'tip_amount',
                        'payment_type',
                        'authorization_code',
                        'card_brand',
                        'masked_card_number',
                        'approved_at',
                    ])
                    .toQuery())];
            }

            default:
                return [];
        }
    },
});
