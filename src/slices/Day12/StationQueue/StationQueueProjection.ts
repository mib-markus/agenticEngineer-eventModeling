import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {sql, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import {
    type OrderLineRoutedToStation,
    type ItemPreparationStarted,
} from '../Day12Events';

export const tableName = 'day12_station_queue';

export type StationQueueReadModel = {
    station: string;
    orderNumber: string;
    tableNumber: string;
    lineNumber: number;
    itemNumber: string;
    quantity: number;
    specialWishes: string;
    routedAt: string;
};

export const getKnexInstance = (): Knex => knex({client: 'pg'});

type StationQueueEvents =
    | OrderLineRoutedToStation
    | ItemPreparationStarted;

export const StationQueueProjection = postgreSQLRawSQLProjection<StationQueueEvents>({
    name: 'StationQueueProjection',
    canHandle: ['OrderLineRoutedToStation', 'ItemPreparationStarted'],
    evolve: async (event): Promise<SQL[]> => {
        const db = getKnexInstance();

        switch (event.type) {
            case 'OrderLineRoutedToStation':
                return [sql(db(tableName)
                    .withSchema('public')
                    .insert({
                        station: event.data.station,
                        order_number: event.data.orderNumber,
                        table_number: event.data.tableNumber,
                        line_number: event.data.lineNumber,
                        item_number: event.data.itemNumber,
                        quantity: event.data.quantity,
                        special_wishes: event.data.specialWishes,
                        routed_at: event.data.routedAt,
                    })
                    .onConflict(['order_number', 'line_number'])
                    .merge(['station', 'table_number', 'item_number', 'quantity', 'special_wishes', 'routed_at'])
                    .toQuery())];

            case 'ItemPreparationStarted':
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
