import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {sql, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import {type OrderOpened, type OrderLineAdded, type OrderLineChanged, type OrderLineRemoved, type OrderSubmittedToKitchen} from '../Day12Events';

export const tableName = 'day12_order_pad';
export const linesTableName = 'day12_order_pad_lines';

export type OrderPadLine = {
    lineNumber: number;
    itemNumber: string;
    quantity: number;
    specialWishes: string;
};

export type OrderPadReadModel = {
    orderNumber: string;
    tableNumber: string;
    serverName: string;
    lineNumber: number[];
    itemNumber: string[];
    quantity: number[];
    specialWishes: string[];
    submitted: boolean;
};

export const getKnexInstance = (): Knex => knex({client: 'pg'});

type OrderPadEvents = OrderOpened | OrderLineAdded | OrderLineChanged | OrderLineRemoved | OrderSubmittedToKitchen;

export const OrderPadProjection = postgreSQLRawSQLProjection<OrderPadEvents>({
    name: 'OrderPadProjection',
    canHandle: ['OrderOpened', 'OrderLineAdded', 'OrderLineChanged', 'OrderLineRemoved', 'OrderSubmittedToKitchen'],
    evolve: async (event): Promise<SQL[]> => {
        const db = getKnexInstance();

        switch (event.type) {
            case 'OrderOpened':
                return [sql(db(tableName)
                    .withSchema('public')
                    .insert({
                        order_number: event.data.orderNumber,
                        table_number: event.data.tableNumber,
                        server_name: event.data.serverName,
                        submitted: false,
                    })
                    .onConflict('order_number')
                    .merge(['table_number', 'server_name'])
                    .toQuery())];

            case 'OrderLineAdded':
                return [sql(db(linesTableName)
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
                return [sql(db(linesTableName)
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
                return [sql(db(linesTableName)
                    .withSchema('public')
                    .where({
                        order_number: event.data.orderNumber,
                        line_number: event.data.lineNumber,
                    })
                    .delete()
                    .toQuery())];

            case 'OrderSubmittedToKitchen':
                return [sql(db(tableName)
                    .withSchema('public')
                    .where({order_number: event.data.orderNumber})
                    .update({submitted: true})
                    .toQuery())];

            default:
                return [];
        }
    },
});
