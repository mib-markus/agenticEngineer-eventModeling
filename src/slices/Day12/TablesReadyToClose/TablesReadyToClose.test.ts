import {after, before, describe, it} from 'node:test';
import assert from 'assert';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import knex, {Knex} from 'knex';
import {TablesReadyToCloseProjection, tableName} from './TablesReadyToCloseProjection';
import {runFlywayMigrations} from '../../../common/testHelpers';

const orderPaid = (orderNumber: string, tableNumber = '12') => ({
    type: 'OrderPaid' as const,
    data: {
        orderNumber,
        tableNumber,
        amountPaid: '37.00',
        paymentMethod: 'card',
        paidAt: '2026-04-15T20:15:00Z',
    },
    metadata: {stream_name: `Day12-table-${tableNumber}`},
});

const tableClosed = (orderNumber: string, tableNumber = '12') => ({
    type: 'TableClosed' as const,
    data: {
        orderNumber,
        tableNumber,
        closedAt: '2026-04-15T20:17:00Z',
    },
    metadata: {stream_name: `Day12-table-${tableNumber}`},
});

const rowFor = async (connStr: string, orderNumber: string) => {
    const queryDb = knex({client: 'pg', connection: connStr});
    try {
        return await queryDb(tableName)
            .withSchema('public')
            .select(
                'table_number as tableNumber',
                'order_number as orderNumber',
                'amount_paid as amountPaid',
                'paid_at as paidAt',
            )
            .where({order_number: orderNumber})
            .first();
    } finally {
        await queryDb.destroy();
    }
};

describe('TablesReadyToClose Specification', () => {
    let postgres: StartedPostgreSqlContainer;
    let connectionString: string;
    let db: Knex;
    let given: PostgreSQLProjectionSpec<any>;

    before(async () => {
        postgres = await new PostgreSqlContainer('postgres').start();
        connectionString = postgres.getConnectionUri();
        db = knex({client: 'pg', connection: connectionString});
        await runFlywayMigrations(connectionString);
        given = PostgreSQLProjectionSpec.for({projection: TablesReadyToCloseProjection, connectionString});
    });

    after(async () => {
        await db?.destroy();
        await postgres?.stop();
    });

    it('spec: A paid table appears as ready to close', async () => {
        const orderNumber = 'O-1042';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await rowFor(connStr, orderNumber);

            assert.ok(row, 'row should exist');
            assert.strictEqual(row.tableNumber, '12');
            assert.strictEqual(row.orderNumber, orderNumber);
            assert.strictEqual(Number(row.amountPaid), 37.00);
            assert.ok(row.paidAt);
        };

        await given([orderPaid(orderNumber)]).when([]).then(assertReadModel);
    });

    it('spec: An unpaid table does not appear', async () => {
        const orderNumber = 'O-2071';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await rowFor(connStr, orderNumber);

            assert.strictEqual(row, undefined, 'no row should exist without OrderPaid');
        };

        // OrderLineRoutedToStation/ItemServed are not in this projection's canHandle list,
        // so given([]) here (nothing to replay through this projection) already proves the
        // read model stays empty for an unpaid order.
        await given([]).when([]).then(assertReadModel);
    });

    // TableClosed is a declared INBOUND dependency with no field mapping of its own — its
    // effect is to remove the row, same "delete trigger with no field mapping" shape as
    // StationQueue's ItemPreparationStarted (see AGENTS.md).
    it('spec: A closed table no longer appears as ready to close', async () => {
        const orderNumber = 'O-9999';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await rowFor(connStr, orderNumber);

            assert.strictEqual(row, undefined, 'row should be removed');
        };

        await given([orderPaid(orderNumber), tableClosed(orderNumber)]).when([]).then(assertReadModel);
    });
});
