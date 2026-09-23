import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {sql, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import {
    type OrderableItemAdded,
    type OrderLineAdded,
    type OrderLineChanged,
    type OrderLineRemoved,
    type OrderSubmittedToKitchen,
    type OrderLineRoutedToStation,
} from '../Day12Events';

export const workingLinesTableName = 'day12_route_working_lines';
export const catalogTableName = 'day12_route_catalog';
export const tableName = 'day12_lines_to_route';

export type OrderLinesToRouteReadModel = {
    orderNumber: string;
    tableNumber: string;
    lineNumber: number;
    itemNumber: string;
    quantity: number;
    specialWishes: string;
    category: string;
};

export const getKnexInstance = (): Knex => knex({client: 'pg'});

type OrderLinesToRouteEvents =
    | OrderableItemAdded
    | OrderLineAdded
    | OrderLineChanged
    | OrderLineRemoved
    | OrderSubmittedToKitchen
    | OrderLineRoutedToStation;

export const OrderLinesToRouteProjection = postgreSQLRawSQLProjection<OrderLinesToRouteEvents>({
    name: 'OrderLinesToRouteProjection',
    canHandle: ['OrderableItemAdded', 'OrderLineAdded', 'OrderLineChanged', 'OrderLineRemoved', 'OrderSubmittedToKitchen', 'OrderLineRoutedToStation'],
    evolve: async (event): Promise<SQL[]> => {
        const db = getKnexInstance();

        switch (event.type) {
            case 'OrderableItemAdded':
                return [sql(db(catalogTableName)
                    .withSchema('public')
                    .insert({
                        item_number: event.data.itemNumber,
                        category: event.data.category,
                    })
                    .onConflict('item_number')
                    .merge(['category'])
                    .toQuery())];

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
                const snapshot = db(`public.${workingLinesTableName} as wl`)
                    .join(`public.${catalogTableName} as c`, 'wl.item_number', 'c.item_number')
                    .where('wl.order_number', event.data.orderNumber)
                    .select(
                        'wl.order_number as order_number',
                        db.raw('? as table_number', [event.data.tableNumber]),
                        'wl.line_number as line_number',
                        'wl.item_number as item_number',
                        'wl.quantity as quantity',
                        'wl.special_wishes as special_wishes',
                        'c.category as category',
                    );

                return [sql(db(tableName)
                    .withSchema('public')
                    .insert(snapshot)
                    .toQuery())];
            }

            case 'OrderLineRoutedToStation':
                return [sql(db(tableName)
                    .withSchema('public')
                    .where({
                        order_number: event.data.orderNumber,
                        line_number: event.data.lineNumber,
                    })
                    .delete()
                    .toQuery())];

            default:
                return [];
        }
    },
});
