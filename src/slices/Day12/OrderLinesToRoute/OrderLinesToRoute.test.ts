import {after, before, describe, it} from 'node:test';
import assert from 'assert';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import knex, {Knex} from 'knex';
import {OrderLinesToRouteProjection, tableName} from './OrderLinesToRouteProjection';
import {runFlywayMigrations} from '../../../common/testHelpers';

const orderableItemAdded = (itemNumber: string, category: string, restaurantId = 'rest-001') => ({
    type: 'OrderableItemAdded' as const,
    data: {itemNumber, name: 'ignored', category, price: '0', restaurantId},
    metadata: {stream_name: `Day12-${restaurantId}`},
});

const orderLineAdded = (
    orderNumber: string,
    lineNumber: number,
    itemNumber: string,
    quantity: number,
    specialWishes: string,
    tableNumber = '12',
) => ({
    type: 'OrderLineAdded' as const,
    data: {orderNumber, lineNumber, itemNumber, quantity, specialWishes},
    metadata: {stream_name: `Day12-table-${tableNumber}`},
});

const orderLineChanged = (
    orderNumber: string,
    lineNumber: number,
    quantity: number,
    specialWishes: string,
    tableNumber = '12',
) => ({
    type: 'OrderLineChanged' as const,
    data: {orderNumber, lineNumber, quantity, specialWishes},
    metadata: {stream_name: `Day12-table-${tableNumber}`},
});

const orderLineRemoved = (orderNumber: string, lineNumber: number, reason: string, tableNumber = '12') => ({
    type: 'OrderLineRemoved' as const,
    data: {orderNumber, lineNumber, reason},
    metadata: {stream_name: `Day12-table-${tableNumber}`},
});

const orderSubmittedToKitchen = (orderNumber: string, tableNumber: string, submittedAt: string) => ({
    type: 'OrderSubmittedToKitchen' as const,
    data: {orderNumber, tableNumber, submittedAt},
    metadata: {stream_name: `Day12-table-${tableNumber}`},
});

const orderLineRoutedToStation = (
    orderNumber: string,
    tableNumber: string,
    lineNumber: number,
    itemNumber: string,
    quantity: number,
    specialWishes: string,
    station: string,
    routedAt: string,
) => ({
    type: 'OrderLineRoutedToStation' as const,
    data: {orderNumber, tableNumber, lineNumber, itemNumber, quantity, specialWishes, station, routedAt},
    metadata: {stream_name: `Day12-table-${tableNumber}`},
});

const lineFor = async (connStr: string, orderNumber: string, lineNumber: number) => {
    const queryDb = knex({client: 'pg', connection: connStr});
    try {
        return await queryDb(tableName)
            .withSchema('public')
            .select(
                'order_number as orderNumber',
                'table_number as tableNumber',
                'line_number as lineNumber',
                'item_number as itemNumber',
                'quantity',
                'special_wishes as specialWishes',
                'category',
            )
            .where({order_number: orderNumber, line_number: lineNumber})
            .first();
    } finally {
        await queryDb.destroy();
    }
};

const linesFor = async (connStr: string, orderNumber: string) => {
    const queryDb = knex({client: 'pg', connection: connStr});
    try {
        return await queryDb(tableName)
            .withSchema('public')
            .select('line_number as lineNumber')
            .where({order_number: orderNumber});
    } finally {
        await queryDb.destroy();
    }
};

describe('OrderLinesToRoute Specification', () => {
    let postgres: StartedPostgreSqlContainer;
    let connectionString: string;
    let db: Knex;
    let given: PostgreSQLProjectionSpec<any>;

    before(async () => {
        postgres = await new PostgreSqlContainer('postgres').start();
        connectionString = postgres.getConnectionUri();
        db = knex({client: 'pg', connection: connectionString});
        await runFlywayMigrations(connectionString);
        given = PostgreSQLProjectionSpec.for({projection: OrderLinesToRouteProjection, connectionString});
    });

    after(async () => {
        await db?.destroy();
        await postgres?.stop();
    });

    it('spec: A submitted line waits to be routed', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const line = await lineFor(connStr, 'O-1042', 1);

            assert.ok(line);
            assert.strictEqual(line.orderNumber, 'O-1042');
            assert.strictEqual(line.tableNumber, '12');
            assert.strictEqual(line.itemNumber, 'M-12');
            assert.strictEqual(line.quantity, 2);
            assert.strictEqual(line.specialWishes, 'without onions');
            assert.strictEqual(line.category, 'Menu');
        };

        await given([
            orderableItemAdded('M-12', 'Menu'),
            orderLineAdded('O-1042', 1, 'M-12', 2, 'without onions'),
            orderSubmittedToKitchen('O-1042', '12', '2026-04-15T19:18:00Z'),
        ]).when([]).then(assertReadModel);
    });

    it('spec: A line on a pad that was never submitted does not wait', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const lines = await linesFor(connStr, 'O-1043');
            assert.strictEqual(lines.length, 0);
        };

        await given([
            orderableItemAdded('M-12', 'Menu'),
            orderLineAdded('O-1043', 1, 'M-12', 2, 'without onions'),
        ]).when([]).then(assertReadModel);
    });

    it('spec: A removed line does not wait to be routed', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const lines = await linesFor(connStr, 'O-1044');
            assert.strictEqual(lines.length, 0);
        };

        await given([
            orderableItemAdded('M-12', 'Menu'),
            orderLineAdded('O-1044', 1, 'M-12', 2, 'without onions'),
            orderLineRemoved('O-1044', 1, 'Guest changed their mind'),
            orderSubmittedToKitchen('O-1044', '12', '2026-04-15T19:18:00Z'),
        ]).when([]).then(assertReadModel);
    });

    it('spec: A changed line waits with its new quantity', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const line = await lineFor(connStr, 'O-1045', 1);

            assert.ok(line);
            assert.strictEqual(line.quantity, 3);
            assert.strictEqual(line.specialWishes, 'without onions, extra fries');
        };

        await given([
            orderableItemAdded('M-12', 'Menu'),
            orderLineAdded('O-1045', 1, 'M-12', 2, 'without onions'),
            orderLineChanged('O-1045', 1, 3, 'without onions, extra fries'),
            orderSubmittedToKitchen('O-1045', '12', '2026-04-15T19:18:00Z'),
        ]).when([]).then(assertReadModel);
    });

    it('spec: An already routed line leaves the list', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const lines = await linesFor(connStr, 'O-1046');
            assert.strictEqual(lines.length, 0);
        };

        await given([
            orderableItemAdded('M-12', 'Menu'),
            orderLineAdded('O-1046', 1, 'M-12', 2, 'without onions'),
            orderSubmittedToKitchen('O-1046', '12', '2026-04-15T19:18:00Z'),
            orderLineRoutedToStation('O-1046', '12', 1, 'M-12', 2, 'without onions', 'kitchen', '2026-04-15T19:18:05Z'),
        ]).when([]).then(assertReadModel);
    });
});
