import {after, before, describe, it} from 'node:test';
import assert from 'assert';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import knex, {Knex} from 'knex';
import {
    PaymentSummaryProjection,
    tableName,
    linesTableName,
    summaryTotals,
    lineTotalOf,
} from './PaymentSummaryProjection';
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

const summaryFor = async (connStr: string, orderNumber: string) => {
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
                'unit_price as unitPrice',
                'line_served as lineServed',
            )
            .where({order_number: orderNumber})
            .orderBy('line_number');

        return {
            ...header,
            lines: lines.map((l) => ({...l, lineTotal: lineTotalOf(l.unitPrice, l.quantity)})),
            ...summaryTotals(lines),
        };
    } finally {
        await queryDb.destroy();
    }
};

describe('PaymentSummary Specification', () => {
    let postgres: StartedPostgreSqlContainer;
    let connectionString: string;
    let db: Knex;
    let given: PostgreSQLProjectionSpec<any>;

    before(async () => {
        postgres = await new PostgreSqlContainer('postgres').start();
        connectionString = postgres.getConnectionUri();
        db = knex({client: 'pg', connection: connectionString});
        await runFlywayMigrations(connectionString);
        given = PostgreSQLProjectionSpec.for({projection: PaymentSummaryProjection, connectionString});
    });

    after(async () => {
        await db?.destroy();
        await postgres?.stop();
    });

    it('spec: Priced summary for a fully served order', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const summary = await summaryFor(connStr, 'O-2001');

            assert.ok(summary);
            assert.strictEqual(summary!.orderNumber, 'O-2001');
            assert.strictEqual(summary!.tableNumber, '12');
            assert.strictEqual(summary!.lines.length, 2);

            assert.strictEqual(summary!.lines[0].lineNumber, 1);
            assert.strictEqual(summary!.lines[0].itemNumber, 'M-12');
            assert.strictEqual(summary!.lines[0].quantity, 2);
            assert.strictEqual(Number(summary!.lines[0].unitPrice), 18.50);
            assert.strictEqual(summary!.lines[0].lineTotal, '37.00');
            assert.strictEqual(summary!.lines[0].lineServed, true);

            assert.strictEqual(summary!.lines[1].lineNumber, 2);
            assert.strictEqual(summary!.lines[1].itemNumber, 'D-03');
            assert.strictEqual(summary!.lines[1].lineTotal, '4.50');
            assert.strictEqual(summary!.lines[1].lineServed, true);

            // 37.00 + 4.50 = 41.50 subtotal; 10% service, 8% tax.
            assert.strictEqual(summary!.subtotal, '41.50');
            assert.strictEqual(summary!.serviceCharge, '4.15');
            assert.strictEqual(summary!.taxAmount, '3.32');
            assert.strictEqual(summary!.totalAmount, '48.97');
        };

        await given([
            orderableItemAdded('M-12', '18.50'),
            orderableItemAdded('D-03', '4.50'),
            orderLineRoutedToStation('O-2001', '12', 1, 'M-12', 2, 'without onions', 'kitchen', '2026-04-15T19:18:05Z'),
            orderLineRoutedToStation('O-2001', '12', 2, 'D-03', 1, '', 'bar', '2026-04-15T19:18:06Z'),
            itemServed('O-2001', '12', 1, 'Anna', '2026-04-15T19:36:00Z'),
            itemServed('O-2001', '12', 2, 'Anna', '2026-04-15T19:37:00Z'),
        ]).when([]).then(assertReadModel);
    });

    it('spec: Unserved lines are still priced but flagged', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const summary = await summaryFor(connStr, 'O-2002');

            assert.ok(summary);
            assert.strictEqual(summary!.lines.length, 2);
            // Both lines priced, neither served.
            assert.strictEqual(summary!.lines[0].lineServed, false);
            assert.strictEqual(summary!.lines[0].lineTotal, '37.00');
            assert.strictEqual(summary!.lines[1].lineServed, false);
            assert.strictEqual(summary!.lines[1].lineTotal, '4.50');
            assert.strictEqual(summary!.subtotal, '41.50');
            assert.strictEqual(summary!.totalAmount, '48.97');
        };

        await given([
            orderableItemAdded('M-12', '18.50'),
            orderableItemAdded('D-03', '4.50'),
            orderLineRoutedToStation('O-2002', '12', 1, 'M-12', 2, 'without onions', 'kitchen', '2026-04-15T19:18:05Z'),
            orderLineRoutedToStation('O-2002', '12', 2, 'D-03', 1, '', 'bar', '2026-04-15T19:18:06Z'),
        ]).when([]).then(assertReadModel);
    });

    it('spec: No routed lines yields no summary', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const summary = await summaryFor(connStr, 'O-2003');
            assert.strictEqual(summary, null);
        };

        await given([
            orderableItemAdded('M-12', '18.50'),
        ]).when([]).then(assertReadModel);
    });
});
