import {after, before, describe, it} from 'node:test';
import assert from 'assert';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import knex, {Knex} from 'knex';
import {DeclinedPaymentsProjection, tableName} from './DeclinedPaymentsProjection';
import {runFlywayMigrations} from '../../../common/testHelpers';

// The specs' first `given` beat (node fab5e2ed) is the linked copy of PaymentRequested from
// the happy-path chapter; the repeated beat 44de61f8 is PaymentDeclined.
const paymentRequested = (
    paymentId: string,
    orderNumber: string,
    totalAmount: string,
    tipAmount: string,
    tableNumber: string,
) => ({
    type: 'PaymentRequested' as const,
    data: {
        paymentId,
        orderNumber,
        tableNumber,
        subtotal: '41.50',
        serviceCharge: '4.15',
        taxAmount: '3.32',
        tipAmount,
        totalAmount,
        paymentType: 'CARD',
        requestedAt: '2026-04-15T20:15:00Z',
    },
    metadata: {stream_name: `Day12-table-${tableNumber}`},
});

const paymentDeclined = (
    paymentId: string,
    orderNumber: string,
    declineReason: string,
    declinedAt: string,
    tableNumber: string,
) => ({
    type: 'PaymentDeclined' as const,
    data: {
        paymentId,
        orderNumber,
        tableNumber,
        declineReason,
        declineCode: '51',
        declinedAt,
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
                'payment_id as paymentId',
                'order_number as orderNumber',
                'total_amount as totalAmount',
                'tip_amount as tipAmount',
                'decline_reason as declineReason',
                'attempt_count as attemptCount',
                'declined_at as declinedAt',
            )
            .where({table_number: tableNumber})
            .first();
    } finally {
        await queryDb.destroy();
    }
};

describe('DeclinedPayments Specification', () => {
    let postgres: StartedPostgreSqlContainer;
    let connectionString: string;
    let db: Knex;
    let given: PostgreSQLProjectionSpec<any>;

    before(async () => {
        postgres = await new PostgreSqlContainer('postgres').start();
        connectionString = postgres.getConnectionUri();
        db = knex({client: 'pg', connection: connectionString});
        await runFlywayMigrations(connectionString);
        given = PostgreSQLProjectionSpec.for({projection: DeclinedPaymentsProjection, connectionString});
    });

    after(async () => {
        await db?.destroy();
        await postgres?.stop();
    });

    it("spec: A declined payment appears on the server's screen", async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await rowFor(connStr, '31');

            assert.ok(row, 'row should exist');
            assert.strictEqual(row.tableNumber, '31');
            assert.strictEqual(row.paymentId, 'p-7001');
            assert.strictEqual(row.orderNumber, 'O-7001');
            assert.strictEqual(Number(row.totalAmount), 53.97);
            assert.strictEqual(Number(row.tipAmount), 5.00);
            assert.strictEqual(row.declineReason, 'Insufficient funds');
            assert.strictEqual(row.attemptCount, 1);
            assert.ok(row.declinedAt);
        };

        await given([
            paymentRequested('p-7001', 'O-7001', '53.97', '5.00', '31'),
            paymentDeclined('p-7001', 'O-7001', 'Insufficient funds', '2026-04-15T20:15:04Z', '31'),
        ]).when([]).then(assertReadModel);
    });

    // attemptCount is aggregate:count(PaymentDeclined per orderNumber): each retry issues a
    // fresh paymentId against the same orderNumber, and the one row for the table counts up.
    it('spec: Three declines on one order count up to three attempts', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await rowFor(connStr, '32');

            assert.ok(row, 'row should exist');
            assert.strictEqual(row.orderNumber, 'O-7002');
            assert.strictEqual(row.attemptCount, 3);
            // The visible row always shows the latest attempt.
            assert.strictEqual(row.paymentId, 'p-7002-c');
            assert.strictEqual(row.declineReason, 'Do not honour');
        };

        await given([
            paymentRequested('p-7002-a', 'O-7002', '53.97', '5.00', '32'),
            paymentDeclined('p-7002-a', 'O-7002', 'Insufficient funds', '2026-04-15T20:15:04Z', '32'),
            paymentRequested('p-7002-b', 'O-7002', '53.97', '5.00', '32'),
            paymentDeclined('p-7002-b', 'O-7002', 'Insufficient funds', '2026-04-15T20:18:04Z', '32'),
            paymentRequested('p-7002-c', 'O-7002', '53.97', '5.00', '32'),
            paymentDeclined('p-7002-c', 'O-7002', 'Do not honour', '2026-04-15T20:21:04Z', '32'),
        ]).when([]).then(assertReadModel);
    });

    it('spec: No declines means nothing to show', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await rowFor(connStr, '33');

            assert.strictEqual(row, undefined, 'nothing to show before a decline is recorded');
        };

        await given([
            paymentRequested('p-7003', 'O-7003', '48.97', '0.00', '33'),
        ]).when([]).then(assertReadModel);
    });
});
