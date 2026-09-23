import {after, before, describe, it} from 'node:test';
import assert from 'assert';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import knex, {Knex} from 'knex';
import {OrderPadProjection, tableName, linesTableName} from './OrderPadProjection';
import {runFlywayMigrations} from '../../../common/testHelpers';

const orderOpened = (orderNumber: string, tableNumber: string, serverName: string, openedAt: string) => ({
    type: 'OrderOpened' as const,
    data: {orderNumber, tableNumber, serverName, openedAt},
    metadata: {stream_name: `Day12-table-${tableNumber}`},
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

const padFor = async (connStr: string, orderNumber: string) => {
    const queryDb = knex({client: 'pg', connection: connStr});
    try {
        const header = await queryDb(tableName)
            .withSchema('public')
            .select(
                'order_number as orderNumber',
                'table_number as tableNumber',
                'server_name as serverName',
                'submitted',
            )
            .where({order_number: orderNumber})
            .first();

        if (!header) return null;

        const lines = await queryDb(linesTableName)
            .withSchema('public')
            .select(
                'line_number as lineNumber',
                'item_number as itemNumber',
                'quantity',
                'special_wishes as specialWishes',
            )
            .where({order_number: orderNumber})
            .orderBy('line_number');

        return {...header, lines};
    } finally {
        await queryDb.destroy();
    }
};

describe('OrderPad Specification', () => {
    let postgres: StartedPostgreSqlContainer;
    let connectionString: string;
    let db: Knex;
    let given: PostgreSQLProjectionSpec<any>;

    before(async () => {
        postgres = await new PostgreSqlContainer('postgres').start();
        connectionString = postgres.getConnectionUri();
        db = knex({client: 'pg', connection: connectionString});
        await runFlywayMigrations(connectionString);
        given = PostgreSQLProjectionSpec.for({projection: OrderPadProjection, connectionString});
    });

    after(async () => {
        await db?.destroy();
        await postgres?.stop();
    });

    it('spec: The pad shows the lines the waiter wrote', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const pad = await padFor(connStr, 'O-1042');

            assert.ok(pad);
            assert.strictEqual(pad!.orderNumber, 'O-1042');
            assert.strictEqual(pad!.tableNumber, '12');
            assert.strictEqual(pad!.serverName, 'Anna');
            assert.strictEqual(pad!.submitted, false);
            assert.strictEqual(pad!.lines.length, 1);
            assert.strictEqual(pad!.lines[0].lineNumber, 1);
            assert.strictEqual(pad!.lines[0].itemNumber, 'M-12');
            assert.strictEqual(pad!.lines[0].quantity, 2);
            assert.strictEqual(pad!.lines[0].specialWishes, 'without onions');
        };

        await given([
            orderOpened('O-1042', '12', 'Anna', '2026-04-15T19:05:00Z'),
            orderLineAdded('O-1042', 1, 'M-12', 2, 'without onions'),
        ]).when([]).then(assertReadModel);
    });

    it('spec: A changed line shows its new quantity and wishes', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const pad = await padFor(connStr, 'O-1043');

            assert.ok(pad);
            assert.strictEqual(pad!.lines.length, 1);
            assert.strictEqual(pad!.lines[0].lineNumber, 1);
            assert.strictEqual(pad!.lines[0].quantity, 3);
            assert.strictEqual(pad!.lines[0].specialWishes, 'without onions, extra fries');
            assert.strictEqual(pad!.submitted, false);
        };

        await given([
            orderOpened('O-1043', '12', 'Anna', '2026-04-15T19:05:00Z'),
            orderLineAdded('O-1043', 1, 'M-12', 2, 'without onions'),
            orderLineChanged('O-1043', 1, 3, 'without onions, extra fries'),
        ]).when([]).then(assertReadModel);
    });

    it('spec: A struck-off line is gone from the pad', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const pad = await padFor(connStr, 'O-1044');

            assert.ok(pad);
            assert.strictEqual(pad!.orderNumber, 'O-1044');
            assert.strictEqual(pad!.tableNumber, '12');
            assert.strictEqual(pad!.serverName, 'Anna');
            assert.strictEqual(pad!.submitted, false);
            assert.strictEqual(pad!.lines.length, 0);
        };

        await given([
            orderOpened('O-1044', '12', 'Anna', '2026-04-15T19:05:00Z'),
            orderLineAdded('O-1044', 1, 'M-12', 2, 'without onions'),
            orderLineRemoved('O-1044', 1, 'Guest changed their mind'),
        ]).when([]).then(assertReadModel);
    });

    it('spec: A submitted pad is marked as gone to the kitchen', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const pad = await padFor(connStr, 'O-1045');

            assert.ok(pad);
            assert.strictEqual(pad!.submitted, true);
            assert.strictEqual(pad!.lines.length, 1);
            assert.strictEqual(pad!.lines[0].itemNumber, 'M-12');
        };

        await given([
            orderOpened('O-1045', '12', 'Anna', '2026-04-15T19:05:00Z'),
            orderLineAdded('O-1045', 1, 'M-12', 2, 'without onions'),
            orderSubmittedToKitchen('O-1045', '12', '2026-04-15T19:18:00Z'),
        ]).when([]).then(assertReadModel);
    });
});
