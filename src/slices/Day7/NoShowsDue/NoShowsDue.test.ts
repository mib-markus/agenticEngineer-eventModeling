import {after, before, describe, it} from 'node:test';
import assert from 'assert';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import knex, {Knex} from 'knex';
import {NoShowsDueProjection, tableName} from './NoShowsDueProjection';
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

const cancelled = (reservationCode: string) => ({
    type: 'ReservationCancelled' as const,
    data: {reservationCode, eMail: EMAIL, date: DATE, startTime: '19:00', tableNumber: '12'},
    metadata: {stream_name: STREAM},
});

// The same predicate the query route applies: a row is due once `now` is past its
// grace period. Every `it` shares one database, so each test uses its own code.
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
                'grace_ends_at as graceEndsAt',
            )
            .where('grace_ends_at_sortable', '<', toSortable(now)!)
            .where({reservation_code: reservationCode});
    } finally {
        await queryDb.destroy();
    }
};

describe('NoShowsDue Specification', () => {
    let postgres: StartedPostgreSqlContainer;
    let connectionString: string;
    let db: Knex;
    let given: PostgreSQLProjectionSpec<any>;

    before(async () => {
        postgres = await new PostgreSqlContainer('postgres').start();
        connectionString = postgres.getConnectionUri();
        db = knex({client: 'pg', connection: connectionString});
        await runFlywayMigrations(connectionString);
        given = PostgreSQLProjectionSpec.for({projection: NoShowsDueProjection, connectionString});
    });

    after(async () => {
        await db?.destroy();
        await postgres?.stop();
    });

    it('spec: A confirmed reservation appears once its 15 minute grace period has expired', async () => {
        const code = 'R-7K2Q';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await dueAt(connStr, '15.04.2026 19:16', code);

            assert.strictEqual(rows.length, 1);
            assert.strictEqual(rows[0].reservationCode, code);
            assert.strictEqual(rows[0].eMail, EMAIL);
            assert.strictEqual(rows[0].date, DATE);
            assert.strictEqual(rows[0].startTime, '19:00');
            assert.strictEqual(rows[0].tableNumber, '12');
            assert.strictEqual(rows[0].graceEndsAt, '15.04.2026 19:15');
        };

        await given([confirmed(code)]).when([]).then(assertReadModel);
    });

    it('spec: A reservation still inside its grace period is not yet due', async () => {
        const code = 'R-GRC1';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await dueAt(connStr, '15.04.2026 19:15', code);
            assert.strictEqual(rows.length, 0, 'at 19:15 the grace period has not yet run out');
        };

        await given([confirmed(code)]).when([]).then(assertReadModel);
    });

    it('spec: A released reservation leaves the due list', async () => {
        const code = 'R-REL1';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await dueAt(connStr, '15.04.2026 19:20', code);
            assert.strictEqual(rows.length, 0, 'releasing must drain the row');
        };

        await given([confirmed(code), released(code)]).when([]).then(assertReadModel);
    });

    it('spec: A cancelled reservation never becomes a no-show', async () => {
        const code = 'R-CAN1';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await dueAt(connStr, '15.04.2026 19:16', code);
            assert.strictEqual(rows.length, 0, 'a cancelled reservation is not a no-show');
        };

        await given([confirmed(code), cancelled(code)]).when([]).then(assertReadModel);
    });

    it('a grace period crossing midnight is due on the following day', async () => {
        const code = 'R-MID1';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await dueAt(connStr, '16.04.2026 00:06', code);

            assert.strictEqual(rows.length, 1);
            assert.strictEqual(rows[0].graceEndsAt, '16.04.2026 00:05');
        };

        await given([confirmed(code, '23:50')]).when([]).then(assertReadModel);
    });
});
