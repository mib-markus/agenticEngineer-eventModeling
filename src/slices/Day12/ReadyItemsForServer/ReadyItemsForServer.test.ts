import {after, before, describe, it} from 'node:test';
import assert from 'assert';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import knex, {Knex} from 'knex';
import {ReadyItemsForServerProjection, tableName} from './ReadyItemsForServerProjection';
import {runFlywayMigrations} from '../../../common/testHelpers';

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

const itemPreparationStarted = (
    orderNumber: string,
    tableNumber: string,
    lineNumber: number,
    station: string,
    startedAt: string,
) => ({
    type: 'ItemPreparationStarted' as const,
    data: {orderNumber, tableNumber, lineNumber, station, startedAt},
    metadata: {stream_name: `Day12-table-${tableNumber}`},
});

const itemMarkedReady = (
    orderNumber: string,
    tableNumber: string,
    lineNumber: number,
    station: string,
    readyAt: string,
) => ({
    type: 'ItemMarkedReady' as const,
    data: {orderNumber, tableNumber, lineNumber, station, readyAt},
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

const readyItemsForTable = async (connStr: string, tableNumber: string) => {
    const queryDb = knex({client: 'pg', connection: connStr});
    try {
        return await queryDb(tableName)
            .withSchema('public')
            .select(
                'table_number as tableNumber',
                'order_number as orderNumber',
                'line_number as lineNumber',
                'item_number as itemNumber',
                'station',
                'ready_at as readyAt',
            )
            .where({table_number: tableNumber});
    } finally {
        await queryDb.destroy();
    }
};

describe('ReadyItemsForServer Specification', () => {
    let postgres: StartedPostgreSqlContainer;
    let connectionString: string;
    let db: Knex;
    let given: PostgreSQLProjectionSpec<any>;

    before(async () => {
        postgres = await new PostgreSqlContainer('postgres').start();
        connectionString = postgres.getConnectionUri();
        db = knex({client: 'pg', connection: connectionString});
        await runFlywayMigrations(connectionString);
        given = PostgreSQLProjectionSpec.for({projection: ReadyItemsForServerProjection, connectionString});
    });

    after(async () => {
        await db?.destroy();
        await postgres?.stop();
    });

    it('spec: A ready item appears on the server\'s board', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await readyItemsForTable(connStr, '12');

            assert.strictEqual(rows.length, 1);
            assert.strictEqual(rows[0].tableNumber, '12');
            assert.strictEqual(rows[0].orderNumber, 'O-1042');
            assert.strictEqual(rows[0].lineNumber, 1);
            assert.strictEqual(rows[0].itemNumber, 'M-12');
            assert.strictEqual(rows[0].station, 'kitchen');
        };

        await given([
            orderLineRoutedToStation('O-1042', '12', 1, 'M-12', 2, 'without onions', 'kitchen', '2026-04-15T19:18:05Z'),
            itemMarkedReady('O-1042', '12', 1, 'kitchen', '2026-04-15T19:34:00Z'),
        ]).when([]).then(assertReadModel);
    });

    it('spec: An item still in preparation does not appear', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await readyItemsForTable(connStr, '13');
            assert.strictEqual(rows.length, 0);
        };

        await given([
            orderLineRoutedToStation('O-1043', '13', 1, 'M-12', 2, 'without onions', 'kitchen', '2026-04-15T19:18:05Z'),
            itemPreparationStarted('O-1043', '13', 1, 'kitchen', '2026-04-15T19:20:00Z'),
        ]).when([]).then(assertReadModel);
    });

    it('spec: An item leaves the server\'s board once served', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await readyItemsForTable(connStr, '14');
            assert.strictEqual(rows.length, 0);
        };

        await given([
            orderLineRoutedToStation('O-1044', '14', 1, 'M-12', 2, 'without onions', 'kitchen', '2026-04-15T19:18:05Z'),
            itemMarkedReady('O-1044', '14', 1, 'kitchen', '2026-04-15T19:34:00Z'),
            itemServed('O-1044', '14', 1, 'Alice', '2026-04-15T19:36:00Z'),
        ]).when([]).then(assertReadModel);
    });
});
