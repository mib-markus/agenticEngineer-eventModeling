import {after, before, describe, it} from 'node:test';
import assert from 'assert';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import knex, {Knex} from 'knex';
import {DeclinesToRecordProjection, tableName} from './DeclinesToRecordProjection';
import {runFlywayMigrations} from '../../../common/testHelpers';

// The specs' first `given` beat (node fab5e2ed) is the linked copy of PaymentRequested
// from the happy-path chapter; the second (54e2f8da) is AuthorizationDeclined; the third
// (44de61f8) is PaymentDeclined.
const paymentRequested = (
    paymentId: string,
    orderNumber: string,
    totalAmount: string,
    tableNumber = '12',
) => ({
    type: 'PaymentRequested' as const,
    data: {
        paymentId,
        orderNumber,
        tableNumber,
        subtotal: '41.50',
        serviceCharge: '4.15',
        taxAmount: '3.32',
        tipAmount: '5.00',
        totalAmount,
        paymentType: 'CARD',
        requestedAt: '2026-04-15T20:15:00Z',
    },
    metadata: {stream_name: `Day12-table-${tableNumber}`},
});

const authorizationDeclined = (
    paymentId: string,
    declineReason: string,
    declineCode: string,
    tableNumber = '12',
) => ({
    type: 'AuthorizationDeclined' as const,
    data: {
        paymentId,
        declineReason,
        declineCode,
        cardBrand: 'VISA',
        maskedCardNumber: '**** **** **** 4242',
        declinedAt: '2026-04-15T20:15:04Z',
    },
    metadata: {stream_name: `Day12-table-${tableNumber}`},
});

const paymentDeclined = (
    paymentId: string,
    orderNumber: string,
    declineReason: string,
    declineCode: string,
    tableNumber = '12',
) => ({
    type: 'PaymentDeclined' as const,
    data: {
        paymentId,
        orderNumber,
        tableNumber,
        declineReason,
        declineCode,
        cardBrand: 'VISA',
        maskedCardNumber: '**** **** **** 4242',
        declinedAt: '2026-04-15T20:15:06Z',
    },
    metadata: {stream_name: `Day12-table-${tableNumber}`},
});

const rowFor = async (connStr: string, paymentId: string) => {
    const queryDb = knex({client: 'pg', connection: connStr});
    try {
        return await queryDb(tableName)
            .withSchema('public')
            .select(
                'payment_id as paymentId',
                'order_number as orderNumber',
                'table_number as tableNumber',
                'total_amount as totalAmount',
                'decline_reason as declineReason',
                'decline_code as declineCode',
                'masked_card_number as maskedCardNumber',
                'declined_at as declinedAt',
            )
            .where({payment_id: paymentId})
            .first();
    } finally {
        await queryDb.destroy();
    }
};

describe('DeclinesToRecord Specification', () => {
    let postgres: StartedPostgreSqlContainer;
    let connectionString: string;
    let db: Knex;
    let given: PostgreSQLProjectionSpec<any>;

    before(async () => {
        postgres = await new PostgreSqlContainer('postgres').start();
        connectionString = postgres.getConnectionUri();
        db = knex({client: 'pg', connection: connectionString});
        await runFlywayMigrations(connectionString);
        given = PostgreSQLProjectionSpec.for({projection: DeclinesToRecordProjection, connectionString});
    });

    after(async () => {
        await db?.destroy();
        await postgres?.stop();
    });

    it('spec: A declined authorization becomes a todo', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await rowFor(connStr, 'p-4001');

            assert.ok(row, 'row should exist');
            assert.strictEqual(row.paymentId, 'p-4001');
            assert.strictEqual(row.orderNumber, 'O-4001');
            assert.strictEqual(row.tableNumber, '12');
            assert.strictEqual(Number(row.totalAmount), 53.97);
            assert.strictEqual(row.declineReason, 'Insufficient funds');
            assert.strictEqual(row.declineCode, '51');
            assert.strictEqual(row.maskedCardNumber, '**** **** **** 4242');
            assert.ok(row.declinedAt);
        };

        await given([
            paymentRequested('p-4001', 'O-4001', '53.97'),
            authorizationDeclined('p-4001', 'Insufficient funds', '51'),
        ]).when([]).then(assertReadModel);
    });

    it('spec: A request with no provider answer yet is not a todo', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await rowFor(connStr, 'p-4002');

            assert.strictEqual(row, undefined, 'no row before the provider answers');
        };

        await given([
            paymentRequested('p-4002', 'O-4002', '48.97'),
        ]).when([]).then(assertReadModel);
    });

    // PaymentDeclined is deliberately not an INBOUND dependency of this read model, so it
    // is not in canHandle and cannot remove the row - a recorded decline stays on the list.
    it('spec: A recorded decline stays on the list', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await rowFor(connStr, 'p-4003');

            assert.ok(row, 'row should still exist after the decline was recorded');
            assert.strictEqual(row.declineCode, '05');
        };

        await given([
            paymentRequested('p-4003', 'O-4003', '53.97'),
            authorizationDeclined('p-4003', 'Do not honour', '05'),
            paymentDeclined('p-4003', 'O-4003', 'Do not honour', '05'),
        ]).when([]).then(assertReadModel);
    });
});
