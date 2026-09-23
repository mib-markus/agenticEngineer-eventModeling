import {after, before, describe, it} from 'node:test';
import assert from 'assert';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import knex, {Knex} from 'knex';
import {TableBillProjection, tableName, linesTableName} from './TableBillProjection';
import {runFlywayMigrations} from '../../../common/testHelpers';

const orderableItemAdded = (itemNumber: string, price: string, restaurantId = 'rest-001') => ({
    type: 'OrderableItemAdded' as const,
    data: {itemNumber, name: 'ignored', category: 'Menu', price, restaurantId},
    metadata: {stream_name: `Day12-${restaurantId}`},
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

const itemServed = (
    orderNumber: string,
    tableNumber: string,
    lineNumber: number,
    serverName: string,
    servedAt: string,
) => ({
    type: 'ItemServed' as const,
    data: {orderNumber, tableNumber, lineNumber, serverName, servedAt},
    metadata: {stream_name: `Day12-table-${tableNumber}`},
});

const billFor = async (connStr: string, orderNumber: string) => {
    const queryDb = knex({client: 'pg', connection: connStr});
    try {
        const header = await queryDb(tableName)
            .withSchema('public')
            .select(
                'order_number as orderNumber',
                'table_number as tableNumber',
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
                'line_served as lineServed',
                'unit_price as unitPrice',
            )
            .where({order_number: orderNumber})
            .orderBy('line_number');

        const totalAmount = lines
            .reduce((sum, l) => sum + Number(l.unitPrice) * l.quantity, 0)
            .toFixed(2);

        return {...header, lines, totalAmount};
    } finally {
        await queryDb.destroy();
    }
};

describe('TableBill Specification', () => {
    let postgres: StartedPostgreSqlContainer;
    let connectionString: string;
    let db: Knex;
    let given: PostgreSQLProjectionSpec<any>;

    before(async () => {
        postgres = await new PostgreSqlContainer('postgres').start();
        connectionString = postgres.getConnectionUri();
        db = knex({client: 'pg', connection: connectionString});
        await runFlywayMigrations(connectionString);
        given = PostgreSQLProjectionSpec.for({projection: TableBillProjection, connectionString});
    });

    after(async () => {
        await db?.destroy();
        await postgres?.stop();
    });

    it('spec: The bill shows a routed line with its price', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const bill = await billFor(connStr, 'O-1042');

            assert.ok(bill);
            assert.strictEqual(bill!.orderNumber, 'O-1042');
            assert.strictEqual(bill!.tableNumber, '12');
            assert.strictEqual(bill!.lines.length, 1);
            assert.strictEqual(bill!.lines[0].lineNumber, 1);
            assert.strictEqual(bill!.lines[0].itemNumber, 'M-12');
            assert.strictEqual(bill!.lines[0].quantity, 2);
            assert.strictEqual(bill!.lines[0].lineServed, false);
            assert.strictEqual(Number(bill!.lines[0].unitPrice), 18.50);
            assert.strictEqual(bill!.totalAmount, '37.00');
        };

        await given([
            orderableItemAdded('M-12', '18.50'),
            orderLineRoutedToStation('O-1042', '12', 1, 'M-12', 2, 'without onions', 'kitchen', '2026-04-15T19:18:05Z'),
        ]).when([]).then(assertReadModel);
    });

    it('spec: A served line is marked as served on the bill', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const bill = await billFor(connStr, 'O-1043');

            assert.ok(bill);
            assert.strictEqual(bill!.lines.length, 1);
            assert.strictEqual(bill!.lines[0].lineServed, true);
            assert.strictEqual(bill!.totalAmount, '37.00');
        };

        await given([
            orderableItemAdded('M-12', '18.50'),
            orderLineRoutedToStation('O-1043', '12', 1, 'M-12', 2, 'without onions', 'kitchen', '2026-04-15T19:18:05Z'),
            itemServed('O-1043', '12', 1, 'Anna', '2026-04-15T19:36:00Z'),
        ]).when([]).then(assertReadModel);
    });

    it('spec: An order with no routed lines has no bill', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const bill = await billFor(connStr, 'O-1044');
            assert.strictEqual(bill, null);
        };

        await given([
            orderableItemAdded('M-12', '18.50'),
        ]).when([]).then(assertReadModel);
    });
});
