import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {sql, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import {type OrderableItemAdded} from '../Day12Events';

export const tableName = 'day12_orderable_items';

export type OrderableItemsReadModel = {
    restaurantId: string;
    itemNumber: string;
    name: string;
    category: string;
    price: string;
};

export const getKnexInstance = (): Knex => knex({client: 'pg'});

export const OrderableItemsProjection = postgreSQLRawSQLProjection<OrderableItemAdded>({
    name: 'OrderableItemsProjection',
    canHandle: ['OrderableItemAdded'],
    evolve: async (event): Promise<SQL[]> => {
        const db = getKnexInstance();

        switch (event.type) {
            case 'OrderableItemAdded':
                return [sql(db(tableName)
                    .withSchema('public')
                    .insert({
                        restaurant_id: event.data.restaurantId,
                        item_number: event.data.itemNumber,
                        name: event.data.name,
                        category: event.data.category,
                        price: event.data.price,
                    })
                    .onConflict(['restaurant_id', 'item_number'])
                    .merge(['name', 'category', 'price'])
                    .toQuery())];

            default:
                return [];
        }
    },
});
