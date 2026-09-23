import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {sql, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import {
    type OrderableItemAdded,
    type OrderLineRoutedToStation,
    type ItemServed,
} from '../Day12Events';

export const catalogTableName = 'day12_tablebill_catalog';
export const tableName = 'day12_tablebill';
export const linesTableName = 'day12_tablebill_lines';

export type TableBillLine = {
    lineNumber: number;
    itemNumber: string;
    quantity: number;
    lineServed: boolean;
    unitPrice: string;
};

export type TableBillReadModel = {
    orderNumber: string;
    tableNumber: string;
    lineNumber: number[];
    itemNumber: string[];
    quantity: number[];
    lineServed: boolean[];
    unitPrice: string[];
    totalAmount: string;
};

export const getKnexInstance = (): Knex => knex({client: 'pg'});

type TableBillEvents =
    | OrderableItemAdded
    | OrderLineRoutedToStation
    | ItemServed;

export const TableBillProjection = postgreSQLRawSQLProjection<TableBillEvents>({
    name: 'TableBillProjection',
    canHandle: ['OrderableItemAdded', 'OrderLineRoutedToStation', 'ItemServed'],
    evolve: async (event): Promise<SQL[]> => {
        const db = getKnexInstance();

        switch (event.type) {
            case 'OrderableItemAdded':
                return [sql(db(catalogTableName)
                    .withSchema('public')
                    .insert({
                        item_number: event.data.itemNumber,
                        price: event.data.price,
                    })
                    .onConflict('item_number')
                    .merge(['price'])
                    .toQuery())];

            case 'OrderLineRoutedToStation': {
                const withPrice = db(`${catalogTableName} as c`)
                    .withSchema('public')
                    .where('c.item_number', event.data.itemNumber)
                    .select(
                        db.raw('? as order_number', [event.data.orderNumber]),
                        db.raw('? as line_number', [event.data.lineNumber]),
                        db.raw('? as item_number', [event.data.itemNumber]),
                        db.raw('? as quantity', [event.data.quantity]),
                        'c.price as unit_price',
                    );

                return [
                    sql(db(tableName)
                        .withSchema('public')
                        .insert({
                            order_number: event.data.orderNumber,
                            table_number: event.data.tableNumber,
                        })
                        .onConflict('order_number')
                        .merge(['table_number'])
                        .toQuery()),
                    sql(db(linesTableName)
                        .withSchema('public')
                        .insert(withPrice)
                        .onConflict(['order_number', 'line_number'])
                        .merge(['item_number', 'quantity', 'unit_price'])
                        .toQuery()),
                ];
            }

            case 'ItemServed':
                return [sql(db(linesTableName)
                    .withSchema('public')
                    .where({
                        order_number: event.data.orderNumber,
                        line_number: event.data.lineNumber,
                    })
                    .update({line_served: true})
                    .toQuery())];

            default:
                return [];
        }
    },
});
