import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {sql, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import {
    type OrderLineRoutedToStation,
    type ItemMarkedReady,
    type ItemServed,
} from '../Day12Events';

export const catalogTableName = 'day12_ready_items_catalog';
export const tableName = 'day12_ready_items_for_server';

export type ReadyItemsForServerReadModel = {
    tableNumber: string;
    orderNumber: string;
    lineNumber: number;
    itemNumber: string;
    station: string;
    readyAt: string;
};

export const getKnexInstance = (): Knex => knex({client: 'pg'});

type ReadyItemsForServerEvents =
    | OrderLineRoutedToStation
    | ItemMarkedReady
    | ItemServed;

export const ReadyItemsForServerProjection = postgreSQLRawSQLProjection<ReadyItemsForServerEvents>({
    name: 'ReadyItemsForServerProjection',
    canHandle: ['OrderLineRoutedToStation', 'ItemMarkedReady', 'ItemServed'],
    evolve: async (event): Promise<SQL[]> => {
        const db = getKnexInstance();

        switch (event.type) {
            case 'OrderLineRoutedToStation':
                return [sql(db(catalogTableName)
                    .withSchema('public')
                    .insert({
                        order_number: event.data.orderNumber,
                        line_number: event.data.lineNumber,
                        item_number: event.data.itemNumber,
                    })
                    .onConflict(['order_number', 'line_number'])
                    .merge(['item_number'])
                    .toQuery())];

            case 'ItemMarkedReady': {
                const withItemNumber = db(`${catalogTableName} as c`)
                    .withSchema('public')
                    .where('c.order_number', event.data.orderNumber)
                    .andWhere('c.line_number', event.data.lineNumber)
                    .select(
                        db.raw('? as order_number', [event.data.orderNumber]),
                        db.raw('? as table_number', [event.data.tableNumber]),
                        db.raw('? as line_number', [event.data.lineNumber]),
                        'c.item_number as item_number',
                        db.raw('? as station', [event.data.station]),
                        db.raw('? as ready_at', [event.data.readyAt]),
                    );

                return [sql(db(tableName)
                    .withSchema('public')
                    .insert(withItemNumber)
                    .onConflict(['order_number', 'line_number'])
                    .merge(['table_number', 'item_number', 'station', 'ready_at'])
                    .toQuery())];
            }

            case 'ItemServed':
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
