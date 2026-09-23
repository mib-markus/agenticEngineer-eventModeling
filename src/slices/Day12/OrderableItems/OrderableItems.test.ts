import {after, before, describe, it} from 'node:test';
import assert from 'assert';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import knex, {Knex} from 'knex';
import {OrderableItemsProjection, tableName} from './OrderableItemsProjection';
import {runFlywayMigrations} from '../../../common/testHelpers';

const RESTAURANT_ID = 'rest-1';

const added = (itemNumber: string, name: string, category: string, price: string, restaurantId = RESTAURANT_ID) => ({
    type: 'OrderableItemAdded' as const,
    data: {
        itemNumber,
        name,
        category,
        price,
        restaurantId,
    },
    metadata: {stream_name: `Day12-${restaurantId}`},
});

const rowsFor = async (connStr: string, restaurantId: string) => {
    const queryDb = knex({client: 'pg', connection: connStr});
    try {
        return await queryDb(tableName)
            .withSchema('public')
            .select(
                'restaurant_id as restaurantId',
                'item_number as itemNumber',
                'name',
                'category',
                'price',
            )
            .where({restaurant_id: restaurantId})
            .orderBy('item_number');
    } finally {
        await queryDb.destroy();
    }
};

describe('OrderableItems Specification', () => {
    let postgres: StartedPostgreSqlContainer;
    let connectionString: string;
    let db: Knex;
    let given: PostgreSQLProjectionSpec<any>;

    before(async () => {
        postgres = await new PostgreSqlContainer('postgres').start();
        connectionString = postgres.getConnectionUri();
        db = knex({client: 'pg', connection: connectionString});
        await runFlywayMigrations(connectionString);
        given = PostgreSQLProjectionSpec.for({projection: OrderableItemsProjection, connectionString});
    });

    after(async () => {
        await db?.destroy();
        await postgres?.stop();
    });

    it('spec: A menu item published by the backoffice is orderable', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await rowsFor(connStr, RESTAURANT_ID);

            assert.strictEqual(rows.length, 1);
            assert.strictEqual(rows[0].restaurantId, RESTAURANT_ID);
            assert.strictEqual(rows[0].itemNumber, 'M-12');
            assert.strictEqual(rows[0].name, 'Wiener Schnitzel');
            assert.strictEqual(rows[0].category, 'Menu');
            assert.strictEqual(Number(rows[0].price), 18.50);
        };

        await given([added('M-12', 'Wiener Schnitzel', 'Menu', '18.50')]).when([]).then(assertReadModel);
    });

    it('spec: A drink published by the backoffice is orderable', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await rowsFor(connStr, RESTAURANT_ID);

            const row = rows.find(r => r.itemNumber === 'D-7');
            assert.ok(row, 'row should exist');
            assert.strictEqual(row.restaurantId, RESTAURANT_ID);
            assert.strictEqual(row.name, 'Fanta');
            assert.strictEqual(row.category, 'Drink');
            assert.strictEqual(Number(row.price), 3.20);
        };

        await given([added('D-7', 'Fanta', 'Drink', '3.20')]).when([]).then(assertReadModel);
    });

    it('spec: A restaurant with no published catalogue has nothing orderable', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await rowsFor(connStr, 'rest-2');

            assert.strictEqual(rows.length, 0);
        };

        await given([]).when([]).then(assertReadModel);
    });
});
