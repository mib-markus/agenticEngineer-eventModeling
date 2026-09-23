import {after, before, describe, it} from 'node:test';
import assert from 'assert';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import knex, {Knex} from 'knex';
import {HeldReservationsProjection, tableName} from './HeldReservationsProjection';
import {runFlywayMigrations} from '../../../common/testHelpers';

const EMAIL = 'max.mustermann@gmx.de';
const DATE = '15.04.2026';

const held = (reservationCode: string, tableNumber = '12') => ({
    type: 'TableHeldForReservation' as const,
    data: {
        tableNumber,
        reservationCode,
        eMail: EMAIL,
        date: DATE,
        startTime: '19:00',
        endTime: '21:00',
    },
    metadata: {stream_name: `Day7-table-${tableNumber}`},
});

const confirmed = (reservationCode: string, tableNumber = '12') => ({
    type: 'ReservationConfirmed' as const,
    data: {
        reservationCode,
        tableNumber,
        eMail: EMAIL,
        date: DATE,
        startTime: '19:00',
        endTime: '21:00',
    },
    metadata: {stream_name: `Day6-${EMAIL}`},
});

const released = (reservationCode: string, tableNumber = '12') => ({
    type: 'TableHoldReleased' as const,
    data: {
        tableNumber,
        reservationCode,
        date: DATE,
        startTime: '19:00',
        endTime: '21:00',
        reason: 'Guest is on the blacklist',
    },
    metadata: {stream_name: `Day7-table-${tableNumber}`},
});

const rowFor = async (connStr: string, reservationCode: string) => {
    const queryDb = knex({client: 'pg', connection: connStr});
    try {
        return await queryDb(tableName)
            .withSchema('public')
            .select(
                'reservation_code as reservationCode',
                'table_number as tableNumber',
                'e_mail as eMail',
                'date',
                'start_time as startTime',
                'end_time as endTime',
            )
            .where({reservation_code: reservationCode})
            .first();
    } finally {
        await queryDb.destroy();
    }
};

describe('HeldReservations Specification', () => {
    let postgres: StartedPostgreSqlContainer;
    let connectionString: string;
    let db: Knex;
    let given: PostgreSQLProjectionSpec<any>;

    before(async () => {
        postgres = await new PostgreSqlContainer('postgres').start();
        connectionString = postgres.getConnectionUri();
        db = knex({client: 'pg', connection: connectionString});
        await runFlywayMigrations(connectionString);
        given = PostgreSQLProjectionSpec.for({projection: HeldReservationsProjection, connectionString});
    });

    after(async () => {
        await db?.destroy();
        await postgres?.stop();
    });

    it('spec: A held reservation is waiting for its checks', async () => {
        const code = 'R-7K2Q';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await rowFor(connStr, code);

            assert.ok(row, 'row should exist');
            assert.strictEqual(row.reservationCode, code);
            assert.strictEqual(row.tableNumber, '12');
            assert.strictEqual(row.eMail, EMAIL);
            assert.strictEqual(row.date, DATE);
            assert.strictEqual(row.startTime, '19:00');
            assert.strictEqual(row.endTime, '21:00');
        };

        await given([held(code)]).when([]).then(assertReadModel);
    });

    it('spec: A confirmed reservation leaves the hold list', async () => {
        const code = 'R-CNF1';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await rowFor(connStr, code);

            assert.strictEqual(row, undefined, 'row should be removed');
        };

        await given([held(code), confirmed(code)]).when([]).then(assertReadModel);
    });

    it('spec: A released hold leaves the hold list', async () => {
        const code = 'R-REL1';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await rowFor(connStr, code);

            assert.strictEqual(row, undefined, 'row should be removed');
        };

        await given([held(code), released(code)]).when([]).then(assertReadModel);
    });
});
