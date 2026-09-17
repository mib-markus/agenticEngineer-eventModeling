import {after, before, describe, it} from 'node:test';
import assert from 'assert';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import knex, {Knex} from 'knex';
import {TableBlocksProjection, tableName} from './TableBlocksProjection';
import {runFlywayMigrations} from '../../../common/testHelpers';

const DATE = '15.04.2026';

const blocked = (tableNumber: string, startTime: string, endTime: string, reason: string) => ({
    type: 'TableBlocked' as const,
    data: {tableNumber, date: DATE, startTime, endTime, reason},
    metadata: {stream_name: `Day7-table-${tableNumber}`},
});

// Every `it` in a suite shares one database, so each test queries its own table number.
const blocksFor = async (connStr: string, tableNumber: string) => {
    const queryDb = knex({client: 'pg', connection: connStr});
    try {
        return await queryDb(tableName)
            .withSchema('public')
            .where({table_number: tableNumber, date: DATE})
            .orderBy('start_time');
    } finally {
        await queryDb.destroy();
    }
};

describe('TableBlocks Specification', () => {
    let postgres: StartedPostgreSqlContainer;
    let connectionString: string;
    let db: Knex;
    let given: PostgreSQLProjectionSpec<any>;

    before(async () => {
        postgres = await new PostgreSqlContainer('postgres').start();
        connectionString = postgres.getConnectionUri();
        db = knex({client: 'pg', connection: connectionString});
        await runFlywayMigrations(connectionString);
        given = PostgreSQLProjectionSpec.for({projection: TableBlocksProjection, connectionString});
    });

    after(async () => {
        await db?.destroy();
        await postgres?.stop();
    });

    it('spec: Show the blocks on a table for a service day', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await blocksFor(connStr, '12');

            assert.strictEqual(rows.length, 1);
            assert.strictEqual(rows[0].table_number, '12');
            assert.strictEqual(rows[0].date, DATE);
            assert.strictEqual(rows[0].start_time, '14:00');
            assert.strictEqual(rows[0].end_time, '17:00');
            assert.strictEqual(rows[0].reason, 'Private event');
        };

        await given([blocked('12', '14:00', '17:00', 'Private event')]).when([]).then(assertReadModel);
    });

    it('spec: A table with no blocks shows an empty list', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await blocksFor(connStr, '7');
            assert.strictEqual(rows.length, 0, 'table 7 was never blocked');
        };

        await given([]).when([]).then(assertReadModel);
    });

    it('a table blocked twice on one day lists both windows', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await blocksFor(connStr, '15');

            assert.strictEqual(rows.length, 2);
            assert.strictEqual(rows[0].start_time, '11:00');
            assert.strictEqual(rows[1].start_time, '19:00');
        };

        await given([
            blocked('15', '11:00', '13:00', 'Maintenance'),
            blocked('15', '19:00', '21:00', 'Private event'),
        ]).when([]).then(assertReadModel);
    });
});
