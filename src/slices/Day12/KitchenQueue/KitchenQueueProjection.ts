import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {sql, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import {type OrderLineAdded, type OrderLineChanged, type OrderLineRemoved, type OrderSubmittedToKitchen} from '../Day12Events';

export const workingLinesTableName = 'day12_kitchen_working_lines';
export const tableName = 'day12_kitchen_queue';
export const linesTableName = 'day12_kitchen_queue_lines';

export type KitchenQueueLine = {
    itemNumber: string;
    quantity: number;
    specialWishes: string;
};

export type KitchenQueueReadModel = {
    orderNumber: string;
    tableNumber: string;
    submittedAt: string;
    itemNumber: string[];
    quantity: number[];
    specialWishes: string[];
};

export const getKnexInstance = (): Knex => knex({client: 'pg'});

type KitchenQueueEvents = OrderLineAdded | OrderLineChanged | OrderLineRemoved | OrderSubmittedToKitchen;

export const KitchenQueueProjection = postgreSQLRawSQLProjection<KitchenQueueEvents>({
    name: 'KitchenQueueProjection',
    canHandle: ['OrderLineAdded', 'OrderLineChanged', 'OrderLineRemoved', 'OrderSubmittedToKitchen'],
    evolve: async (event): Promise<SQL[]> => {
        const db = getKnexInstance();

        switch (event.type) {
            case 'OrderLineAdded':
                return [sql(db(workingLinesTableName)
                    .withSchema('public')
                    .insert({
                        order_number: event.data.orderNumber,
                        line_number: event.data.lineNumber,
                        item_number: event.data.itemNumber,
                        quantity: event.data.quantity,
                        special_wishes: event.data.specialWishes,
                    })
                    .onConflict(['order_number', 'line_number'])
                    .merge(['item_number', 'quantity', 'special_wishes'])
                    .toQuery())];

            case 'OrderLineChanged':
                return [sql(db(workingLinesTableName)
                    .withSchema('public')
                    .where({
                        order_number: event.data.orderNumber,
                        line_number: event.data.lineNumber,
                    })
                    .update({
                        quantity: event.data.quantity,
                        special_wishes: event.data.specialWishes,
                    })
                    .toQuery())];

            case 'OrderLineRemoved':
                return [sql(db(workingLinesTableName)
                    .withSchema('public')
                    .where({
                        order_number: event.data.orderNumber,
                        line_number: event.data.lineNumber,
                    })
                    .delete()
                    .toQuery())];

            case 'OrderSubmittedToKitchen': {
                const snapshot = db(workingLinesTableName)
                    .withSchema('public')
                    .select('order_number', 'line_number', 'item_number', 'quantity', 'special_wishes')
                    .where({order_number: event.data.orderNumber});

                return [
                    sql(db(tableName)
                        .withSchema('public')
                        .insert({
                            order_number: event.data.orderNumber,
                            table_number: event.data.tableNumber,
                            submitted_at: event.data.submittedAt,
                        })
                        .onConflict('order_number')
                        .merge(['table_number', 'submitted_at'])
                        .toQuery()),
                    sql(db(linesTableName)
                        .withSchema('public')
                        .insert(snapshot)
                        .toQuery()),
                ];
            }

            default:
                return [];
        }
    },
});
