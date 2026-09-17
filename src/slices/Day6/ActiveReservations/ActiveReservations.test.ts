import {after, before, describe, it} from 'node:test';
import assert from 'assert';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import knex, {Knex} from 'knex';
import {ActiveReservationsProjection, tableName} from './ActiveReservationsProjection';
import {runFlywayMigrations} from '../../../common/testHelpers';

const DATE = '15.04.2026';

const streamFor = (eMail: string) => `Day6-${eMail}`;

const placed = (reservationCode: string, eMail: string) => ({
    type: 'ReservationPlaced' as const,
    data: {
        reservationCode,
        eMail,
        date: DATE,
        startTime: '19:00',
        endTime: '21:00',
        numberOfPeople: '4',
    },
    metadata: {stream_name: streamFor(eMail)},
});

const confirmed = (reservationCode: string, eMail: string, tableNumber: string) => ({
    type: 'ReservationConfirmed' as const,
    data: {
        reservationCode,
        tableNumber,
        eMail,
        date: DATE,
        startTime: '19:00',
        endTime: '21:00',
    },
    metadata: {stream_name: streamFor(eMail)},
});

const cancelled = (reservationCode: string, eMail: string, tableNumber: string) => ({
    type: 'ReservationCancelled' as const,
    data: {
        reservationCode,
        eMail,
        date: DATE,
        startTime: '19:00',
        tableNumber,
    },
    metadata: {stream_name: streamFor(eMail)},
});

// The board's query key is eMail, so each test uses its own guest — every `it` in the
// suite shares one database, and querying by a shared address would also return rows
// left behind by earlier tests.
const listFor = async (connStr: string, eMail: string) => {
    const queryDb = knex({client: 'pg', connection: connStr});
    try {
        return await queryDb(tableName)
            .withSchema('public')
            .select(
                'reservation_code as reservationCode',
                'e_mail as eMail',
                'date',
                'start_time as startTime',
                'end_time as endTime',
                'number_of_people as numberOfPeople',
                'table_number as tableNumber',
            )
            .where({e_mail: eMail});
    } finally {
        await queryDb.destroy();
    }
};

describe('ActiveReservations Specification', () => {
    let postgres: StartedPostgreSqlContainer;
    let connectionString: string;
    let db: Knex;
    let given: PostgreSQLProjectionSpec<any>;

    before(async () => {
        postgres = await new PostgreSqlContainer('postgres').start();
        connectionString = postgres.getConnectionUri();
        db = knex({client: 'pg', connection: connectionString});
        await runFlywayMigrations(connectionString);
        given = PostgreSQLProjectionSpec.for({projection: ActiveReservationsProjection, connectionString});
    });

    after(async () => {
        await db?.destroy();
        await postgres?.stop();
    });

    it('spec: A guest sees a reservation awaiting confirmation', async () => {
        const code = 'R-7K2Q';
        const eMail = 'awaiting@gmx.de';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await listFor(connStr, eMail);

            assert.strictEqual(rows.length, 1);
            assert.strictEqual(rows[0].reservationCode, code);
            assert.strictEqual(rows[0].date, DATE);
            assert.strictEqual(rows[0].startTime, '19:00');
            assert.strictEqual(rows[0].endTime, '21:00');
            assert.strictEqual(rows[0].numberOfPeople, '4');
            assert.strictEqual(rows[0].tableNumber, null, 'no table until staff confirm');
        };

        await given([placed(code, eMail)]).when([]).then(assertReadModel);
    });

    it('spec: A confirmed reservation shows its table', async () => {
        const code = 'R-CONF';
        const eMail = 'confirmed@gmx.de';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await listFor(connStr, eMail);

            assert.strictEqual(rows.length, 1);
            assert.strictEqual(rows[0].reservationCode, code);
            assert.strictEqual(rows[0].tableNumber, '12');
        };

        await given([placed(code, eMail), confirmed(code, eMail, '12')]).when([]).then(assertReadModel);
    });

    it('spec: A cancelled reservation is no longer listed', async () => {
        const code = 'R-CANC';
        const eMail = 'cancelled@gmx.de';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await listFor(connStr, eMail);
            assert.strictEqual(rows.length, 0, 'a cancelled reservation leaves the active list');
        };

        await given([placed(code, eMail), cancelled(code, eMail, '')]).when([]).then(assertReadModel);
    });

    it('spec: A guest with no bookings sees an empty list', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await listFor(connStr, 'nobody@gmx.de');
            assert.strictEqual(rows.length, 0);
        };

        await given([]).when([]).then(assertReadModel);
    });
});
