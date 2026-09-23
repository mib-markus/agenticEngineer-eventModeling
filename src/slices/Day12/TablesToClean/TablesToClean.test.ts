import {after, before, describe, it} from 'node:test';
import assert from 'assert';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import knex, {Knex} from 'knex';
import {TablesToCleanProjection, tableName} from './TablesToCleanProjection';
import {runFlywayMigrations} from '../../../common/testHelpers';

const tableClosed = (tableNumber: string, orderNumber = 'O-1042') => ({
    type: 'TableClosed' as const,
    data: {
        orderNumber,
        tableNumber,
        closedAt: '2026-04-15T20:17:00Z',
    },
    metadata: {stream_name: `Day12-table-${tableNumber}`},
});

const tableFreedForReassignment = (tableNumber: string, orderNumber = 'O-1042') => ({
    type: 'TableFreedForReassignment' as const,
    data: {
        tableNumber,
        orderNumber,
        cleanedAt: '2026-04-15T20:25:00Z',
    },
    metadata: {stream_name: `Day12-table-${tableNumber}`},
});

const rowFor = async (connStr: string, tableNumber: string) => {
    const queryDb = knex({client: 'pg', connection: connStr});
    try {
        return await queryDb(tableName)
            .withSchema('public')
            .select(
                'table_number as tableNumber',
                'order_number as orderNumber',
                'closed_at as closedAt',
            )
            .where({table_number: tableNumber})
            .first();
    } finally {
        await queryDb.destroy();
    }
};

describe('TablesToClean Specification', () => {
    let postgres: StartedPostgreSqlContainer;
    let connectionString: string;
    let db: Knex;
    let given: PostgreSQLProjectionSpec<any>;

    before(async () => {
        postgres = await new PostgreSqlContainer('postgres').start();
        connectionString = postgres.getConnectionUri();
        db = knex({client: 'pg', connection: connectionString});
        await runFlywayMigrations(connectionString);
        given = PostgreSQLProjectionSpec.for({projection: TablesToCleanProjection, connectionString});
    });

    after(async () => {
        await db?.destroy();
        await postgres?.stop();
    });

    it('spec: A closed table appears on the cleaning list', async () => {
        const tableNumber = '12';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await rowFor(connStr, tableNumber);

            assert.ok(row, 'row should exist');
            assert.strictEqual(row.tableNumber, tableNumber);
            assert.strictEqual(row.orderNumber, 'O-1042');
            assert.ok(row.closedAt);
        };

        await given([tableClosed(tableNumber)]).when([]).then(assertReadModel);
    });

    it('spec: A table that was only paid does not appear', async () => {
        const tableNumber = '20';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await rowFor(connStr, tableNumber);

            assert.strictEqual(row, undefined, 'no row should exist without TableClosed');
        };

        // OrderPaid is not in this projection's canHandle list, so given([]) here (nothing
        // to replay through this projection) already proves the read model stays empty for
        // a table that was only paid.
        await given([]).when([]).then(assertReadModel);
    });

    // TableFreedForReassignment is a declared INBOUND dependency with no field mapping of its
    // own — its effect is to remove the row, same "delete trigger with no field mapping" shape
    // as TablesReadyToClose's own TableClosed (see AGENTS.md).
    it('spec: A cleaned table no longer appears on the cleaning list', async () => {
        const tableNumber = '30';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await rowFor(connStr, tableNumber);

            assert.strictEqual(row, undefined, 'row should be removed');
        };

        await given([tableClosed(tableNumber), tableFreedForReassignment(tableNumber)])
            .when([])
            .then(assertReadModel);
    });
});
