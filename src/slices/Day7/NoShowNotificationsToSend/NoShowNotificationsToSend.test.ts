import {after, before, describe, it} from 'node:test';
import assert from 'assert';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import knex, {Knex} from 'knex';
import {NoShowNotificationsToSendProjection, tableName} from './NoShowNotificationsToSendProjection';
import {runFlywayMigrations} from '../../../common/testHelpers';

const EMAIL = 'max.mustermann@gmx.de';
const DATE = '15.04.2026';
const STREAM = `Day6-${EMAIL}`;

const released = (reservationCode: string) => ({
    type: 'ReservationReleasedAsNoShow' as const,
    data: {
        reservationCode,
        eMail: EMAIL,
        date: DATE,
        startTime: '19:00',
        tableNumber: '12',
        releasedAt: '15.04.2026 19:15',
    },
    metadata: {stream_name: STREAM},
});

const notificationSent = (reservationCode: string) => ({
    type: 'NoShowNotificationSent' as const,
    data: {reservationCode, eMail: EMAIL, sentAt: '15.04.2026 19:15'},
    metadata: {stream_name: STREAM},
});

// Every `it` shares one database, so each test queues its own reservation code.
const queued = async (connStr: string, reservationCode: string) => {
    const queryDb = knex({client: 'pg', connection: connStr});
    try {
        return await queryDb(tableName)
            .withSchema('public')
            .select(
                'reservation_code as reservationCode',
                'e_mail as eMail',
                'date',
                'start_time as startTime',
            )
            .where({reservation_code: reservationCode});
    } finally {
        await queryDb.destroy();
    }
};

describe('NoShowNotificationsToSend Specification', () => {
    let postgres: StartedPostgreSqlContainer;
    let connectionString: string;
    let db: Knex;
    let given: PostgreSQLProjectionSpec<any>;

    before(async () => {
        postgres = await new PostgreSqlContainer('postgres').start();
        connectionString = postgres.getConnectionUri();
        db = knex({client: 'pg', connection: connectionString});
        await runFlywayMigrations(connectionString);
        given = PostgreSQLProjectionSpec.for({
            projection: NoShowNotificationsToSendProjection,
            connectionString,
        });
    });

    after(async () => {
        await db?.destroy();
        await postgres?.stop();
    });

    it('spec: A released reservation is queued for a guest notification', async () => {
        const code = 'R-7K2Q';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await queued(connStr, code);

            assert.strictEqual(rows.length, 1);
            assert.strictEqual(rows[0].reservationCode, code);
            assert.strictEqual(rows[0].eMail, EMAIL);
            assert.strictEqual(rows[0].date, DATE);
            assert.strictEqual(rows[0].startTime, '19:00');
        };

        await given([released(code)]).when([]).then(assertReadModel);
    });

    it('spec: A notified guest leaves the queue', async () => {
        const code = 'R-SNT1';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await queued(connStr, code);
            assert.strictEqual(rows.length, 0, 'sending the notice must drain the row');
        };

        await given([released(code), notificationSent(code)]).when([]).then(assertReadModel);
    });
});
