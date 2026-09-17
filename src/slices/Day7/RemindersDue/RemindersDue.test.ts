import {after, before, describe, it} from 'node:test';
import assert from 'assert';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import knex, {Knex} from 'knex';
import {RemindersDueProjection, tableName} from './RemindersDueProjection';
import {toSortable} from './routes';
import {runFlywayMigrations} from '../../../common/testHelpers';

const EMAIL = 'max.mustermann@gmx.de';
const DATE = '15.04.2026';
const STREAM = `Day6-${EMAIL}`;

const confirmed = (reservationCode: string, startTime = '19:00') => ({
    type: 'ReservationConfirmed' as const,
    data: {reservationCode, tableNumber: '12', eMail: EMAIL, date: DATE, startTime, endTime: '21:00'},
    metadata: {stream_name: STREAM},
});

const reminderSent = (reservationCode: string) => ({
    type: 'ReservationReminderSent' as const,
    data: {reservationCode, eMail: EMAIL, sentAt: '15.04.2026 17:01'},
    metadata: {stream_name: STREAM},
});

const cancelled = (reservationCode: string) => ({
    type: 'ReservationCancelled' as const,
    data: {reservationCode, eMail: EMAIL, date: DATE, startTime: '19:00', tableNumber: '12'},
    metadata: {stream_name: STREAM},
});

// The same predicate the query route applies: a row is due once `now` is past its
// reminder window. Every `it` shares one database, so each test uses its own code.
const dueAt = async (connStr: string, now: string, reservationCode: string) => {
    const queryDb = knex({client: 'pg', connection: connStr});
    try {
        return await queryDb(tableName)
            .withSchema('public')
            .select(
                'reservation_code as reservationCode',
                'e_mail as eMail',
                'date',
                'start_time as startTime',
                'table_number as tableNumber',
                'remind_at as remindAt',
            )
            .where('remind_at_sortable', '<', toSortable(now)!)
            .where({reservation_code: reservationCode});
    } finally {
        await queryDb.destroy();
    }
};

describe('RemindersDue Specification', () => {
    let postgres: StartedPostgreSqlContainer;
    let connectionString: string;
    let db: Knex;
    let given: PostgreSQLProjectionSpec<any>;

    before(async () => {
        postgres = await new PostgreSqlContainer('postgres').start();
        connectionString = postgres.getConnectionUri();
        db = knex({client: 'pg', connection: connectionString});
        await runFlywayMigrations(connectionString);
        given = PostgreSQLProjectionSpec.for({projection: RemindersDueProjection, connectionString});
    });

    after(async () => {
        await db?.destroy();
        await postgres?.stop();
    });

    it('spec: A confirmed reservation appears once the reminder window is reached', async () => {
        const code = 'R-7K2Q';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await dueAt(connStr, '15.04.2026 17:01', code);

            assert.strictEqual(rows.length, 1);
            assert.strictEqual(rows[0].reservationCode, code);
            assert.strictEqual(rows[0].eMail, EMAIL);
            assert.strictEqual(rows[0].date, DATE);
            assert.strictEqual(rows[0].startTime, '19:00');
            assert.strictEqual(rows[0].tableNumber, '12');
            assert.strictEqual(rows[0].remindAt, '15.04.2026 17:00');
        };

        await given([confirmed(code)]).when([]).then(assertReadModel);
    });

    it('spec: Not yet due exactly 120 minutes before the booked time', async () => {
        const code = 'R-LEAD1';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await dueAt(connStr, '15.04.2026 16:59', code);
            assert.strictEqual(rows.length, 0, 'at 16:59 the reminder window has not opened yet');
        };

        await given([confirmed(code)]).when([]).then(assertReadModel);
    });

    it('spec: An already reminded reservation leaves the due list', async () => {
        const code = 'R-RMD1';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await dueAt(connStr, '15.04.2026 17:30', code);
            assert.strictEqual(rows.length, 0, 'sending the reminder must drain the row');
        };

        await given([confirmed(code), reminderSent(code)]).when([]).then(assertReadModel);
    });

    it('spec: A cancelled reservation is never reminded', async () => {
        const code = 'R-CAN1';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await dueAt(connStr, '15.04.2026 17:30', code);
            assert.strictEqual(rows.length, 0, 'a cancelled guest gets no reminder');
        };

        await given([confirmed(code), cancelled(code)]).when([]).then(assertReadModel);
    });

    it('a reminder window reaching back over midnight is due on the previous day', async () => {
        const code = 'R-MID1';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await dueAt(connStr, '14.04.2026 23:01', code);

            assert.strictEqual(rows.length, 1);
            assert.strictEqual(rows[0].remindAt, '14.04.2026 23:00');
        };

        await given([confirmed(code, '01:00')]).when([]).then(assertReadModel);
    });
});
