import {after, before, describe, it} from 'node:test';
import assert from 'assert';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import knex, {Knex} from 'knex';
import {StationQueueProjection, tableName} from './StationQueueProjection';
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

const linesForStation = async (connStr: string, station: string) => {
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
                'routed_at as routedAt',
            )
            .where({station});
    } finally {
        await queryDb.destroy();
    }
};

describe('StationQueue Specification', () => {
    let postgres: StartedPostgreSqlContainer;
    let connectionString: string;
    let db: Knex;
    let given: PostgreSQLProjectionSpec<any>;

    before(async () => {
        postgres = await new PostgreSqlContainer('postgres').start();
        connectionString = postgres.getConnectionUri();
        db = knex({client: 'pg', connection: connectionString});
        await runFlywayMigrations(connectionString);
        given = PostgreSQLProjectionSpec.for({projection: StationQueueProjection, connectionString});
    });

    after(async () => {
        await db?.destroy();
        await postgres?.stop();
    });

    it('spec: The station queue shows a routed line with its special wishes', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const lines = await linesForStation(connStr, 'kitchen');

            assert.strictEqual(lines.length, 1);
            assert.strictEqual(lines[0].orderNumber, 'O-1042');
            assert.strictEqual(lines[0].tableNumber, '12');
            assert.strictEqual(lines[0].lineNumber, 1);
            assert.strictEqual(lines[0].itemNumber, 'M-12');
            assert.strictEqual(lines[0].quantity, 2);
            assert.strictEqual(lines[0].specialWishes, 'without onions');
        };

        await given([
            orderLineRoutedToStation('O-1042', '12', 1, 'M-12', 2, 'without onions', 'kitchen', '2026-04-15T19:18:05Z'),
        ]).when([]).then(assertReadModel);
    });

    it('spec: The station queue is empty before anything is routed', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const lines = await linesForStation(connStr, 'dessert');
            assert.strictEqual(lines.length, 0);
        };

        await given([]).when([]).then(assertReadModel);
    });

    it('spec: A line leaves the station queue once its preparation has started', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const lines = await linesForStation(connStr, 'bar');
            assert.strictEqual(lines.length, 0);
        };

        await given([
            orderLineRoutedToStation('O-1043', '12', 1, 'M-12', 2, 'without onions', 'bar', '2026-04-15T19:18:05Z'),
            itemPreparationStarted('O-1043', '12', 1, 'bar', '2026-04-15T19:20:00Z'),
        ]).when([]).then(assertReadModel);
    });
});
