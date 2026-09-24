import {after, before, describe, it} from 'node:test';
import assert from 'assert';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import knex, {Knex} from 'knex';
import {AuthorizationsToRecordProjection, tableName} from './AuthorizationsToRecordProjection';
import {runFlywayMigrations} from '../../../common/testHelpers';

const paymentRequested = (
    paymentId: string,
    orderNumber: string,
    totalAmount: string,
    tipAmount: string,
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
        tipAmount,
        totalAmount,
        paymentType: 'CARD',
        requestedAt: '2026-04-15T20:15:00Z',
    },
    metadata: {stream_name: `Day12-table-${tableNumber}`},
});

const authorizationApproved = (
    paymentId: string,
    authorizationCode: string,
    authorizedAmount: string,
    tableNumber = '12',
) => ({
    type: 'AuthorizationApproved' as const,
    data: {
        paymentId,
        authorizationCode,
        cardBrand: 'VISA',
        maskedCardNumber: '**** **** **** 4242',
        authorizedAmount,
        approvedAt: '2026-04-15T20:15:04Z',
    },
    metadata: {stream_name: `Day12-table-${tableNumber}`},
});

const orderPaid = (orderNumber: string, paymentId: string, tableNumber = '12') => ({
    type: 'OrderPaid' as const,
    data: {
        orderNumber,
        tableNumber,
        amountPaid: '53.97',
        paymentMethod: 'CARD',
        paidAt: '2026-04-15T20:15:06Z',
        paymentId,
        tipAmount: '5.00',
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
                'tip_amount as tipAmount',
                'payment_type as paymentType',
                'authorization_code as authorizationCode',
                'card_brand as cardBrand',
                'masked_card_number as maskedCardNumber',
                'approved_at as approvedAt',
            )
            .where({payment_id: paymentId})
            .first();
    } finally {
        await queryDb.destroy();
    }
};

describe('AuthorizationsToRecord Specification', () => {
    let postgres: StartedPostgreSqlContainer;
    let connectionString: string;
    let db: Knex;
    let given: PostgreSQLProjectionSpec<any>;

    before(async () => {
        postgres = await new PostgreSqlContainer('postgres').start();
        connectionString = postgres.getConnectionUri();
        db = knex({client: 'pg', connection: connectionString});
        await runFlywayMigrations(connectionString);
        given = PostgreSQLProjectionSpec.for({projection: AuthorizationsToRecordProjection, connectionString});
    });

    after(async () => {
        await db?.destroy();
        await postgres?.stop();
    });

    it('spec: An approved authorization becomes a todo', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await rowFor(connStr, 'p-3001');

            assert.ok(row, 'row should exist');
            assert.strictEqual(row.paymentId, 'p-3001');
            assert.strictEqual(row.orderNumber, 'O-3001');
            assert.strictEqual(row.tableNumber, '12');
            assert.strictEqual(Number(row.totalAmount), 53.97);
            assert.strictEqual(Number(row.tipAmount), 5.00);
            assert.strictEqual(row.paymentType, 'CARD');
            assert.strictEqual(row.authorizationCode, 'A-99213');
            assert.strictEqual(row.cardBrand, 'VISA');
            assert.strictEqual(row.maskedCardNumber, '**** **** **** 4242');
            assert.ok(row.approvedAt);
        };

        await given([
            paymentRequested('p-3001', 'O-3001', '53.97', '5.00'),
            authorizationApproved('p-3001', 'A-99213', '53.97'),
        ]).when([]).then(assertReadModel);
    });

    it('spec: A request with no provider answer yet is not a todo', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await rowFor(connStr, 'p-3002');

            assert.strictEqual(row, undefined, 'no row before the provider answers');
        };

        await given([
            paymentRequested('p-3002', 'O-3002', '48.97', '0.00'),
        ]).when([]).then(assertReadModel);
    });

    // OrderPaid is deliberately not an INBOUND dependency of this read model, so it is
    // not in canHandle and cannot remove the row - a recorded authorization stays on
    // the list.
    it('spec: A recorded authorization stays on the list', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await rowFor(connStr, 'p-3003');

            assert.ok(row, 'row should still exist after the payment was recorded');
            assert.strictEqual(row.authorizationCode, 'A-99215');
        };

        await given([
            paymentRequested('p-3003', 'O-3003', '53.97', '5.00'),
            authorizationApproved('p-3003', 'A-99215', '53.97'),
            orderPaid('O-3003', 'p-3003'),
        ]).when([]).then(assertReadModel);
    });
});
