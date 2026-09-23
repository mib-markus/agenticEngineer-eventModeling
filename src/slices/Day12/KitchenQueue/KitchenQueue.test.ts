import {after, before, describe, it} from 'node:test';
import assert from 'assert';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import knex, {Knex} from 'knex';
import {KitchenQueueProjection, tableName, linesTableName} from './KitchenQueueProjection';
import {runFlywayMigrations} from '../../../common/testHelpers';

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

const queueEntryFor = async (connStr: string, orderNumber: string) => {
    const queryDb = knex({client: 'pg', connection: connStr});
    try {
        const header = await queryDb(tableName)
            .withSchema('public')
            .select(
                'order_number as orderNumber',
                'table_number as tableNumber',
                'submitted_at as submittedAt',
            )
            .where({order_number: orderNumber})
            .first();

        if (!header) return null;

        const lines = await queryDb(linesTableName)
            .withSchema('public')
            .select(
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

describe('KitchenQueue Specification', () => {
    let postgres: StartedPostgreSqlContainer;
    let connectionString: string;
    let db: Knex;
    let given: PostgreSQLProjectionSpec<any>;

    before(async () => {
        postgres = await new PostgreSqlContainer('postgres').start();
        connectionString = postgres.getConnectionUri();
        db = knex({client: 'pg', connection: connectionString});
        await runFlywayMigrations(connectionString);
        given = PostgreSQLProjectionSpec.for({projection: KitchenQueueProjection, connectionString});
    });

    after(async () => {
        await db?.destroy();
        await postgres?.stop();
    });

    it('spec: A submitted order appears in the kitchen queue', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const entry = await queueEntryFor(connStr, 'O-1042');

            assert.ok(entry);
            assert.strictEqual(entry!.orderNumber, 'O-1042');
            assert.strictEqual(entry!.tableNumber, '12');
            assert.strictEqual(entry!.lines.length, 1);
            assert.strictEqual(entry!.lines[0].itemNumber, 'M-12');
            assert.strictEqual(entry!.lines[0].quantity, 2);
            assert.strictEqual(entry!.lines[0].specialWishes, 'without onions');
        };

        await given([
            orderLineAdded('O-1042', 1, 'M-12', 2, 'without onions'),
            orderSubmittedToKitchen('O-1042', '12', '2026-04-15T19:18:00Z'),
        ]).when([]).then(assertReadModel);
    });

    it('spec: The kitchen sees the corrected quantity, not the original one', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const entry = await queueEntryFor(connStr, 'O-1043');

            assert.ok(entry);
            assert.strictEqual(entry!.lines.length, 1);
            assert.strictEqual(entry!.lines[0].quantity, 3);
            assert.strictEqual(entry!.lines[0].specialWishes, 'without onions, extra fries');
        };

        await given([
            orderLineAdded('O-1043', 1, 'M-12', 2, 'without onions'),
            orderLineChanged('O-1043', 1, 3, 'without onions, extra fries'),
            orderSubmittedToKitchen('O-1043', '12', '2026-04-15T19:18:00Z'),
        ]).when([]).then(assertReadModel);
    });

    it('spec: The kitchen never sees a line that was struck off before submission', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const entry = await queueEntryFor(connStr, 'O-1044');

            assert.ok(entry);
            assert.strictEqual(entry!.lines.length, 1);
            assert.strictEqual(entry!.lines[0].itemNumber, 'D-7');
        };

        await given([
            orderLineAdded('O-1044', 1, 'M-12', 2, 'without onions'),
            orderLineRemoved('O-1044', 1, 'Guest changed their mind'),
            orderLineAdded('O-1044', 2, 'D-7', 1, ''),
            orderSubmittedToKitchen('O-1044', '12', '2026-04-15T19:18:00Z'),
        ]).when([]).then(assertReadModel);
    });

    it('spec: An order still being written is not in the kitchen queue', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const entry = await queueEntryFor(connStr, 'O-1045');

            assert.strictEqual(entry, null);
        };

        await given([
            orderLineAdded('O-1045', 1, 'M-12', 2, 'without onions'),
        ]).when([]).then(assertReadModel);
    });
});
