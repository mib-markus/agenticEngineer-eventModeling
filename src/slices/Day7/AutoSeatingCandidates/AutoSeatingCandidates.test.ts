import {after, before, describe, it} from 'node:test';
import assert from 'assert';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import knex, {Knex} from 'knex';
import {AutoSeatingCandidatesProjection, tableName} from './AutoSeatingCandidatesProjection';
import {runFlywayMigrations} from '../../../common/testHelpers';

const EMAIL = 'max.mustermann@gmx.de';
const DATE = '15.04.2026';
const STREAM = `Day6-${EMAIL}`;

const placed = (reservationCode: string) => ({
    type: 'ReservationPlaced' as const,
    data: {
        reservationCode,
        eMail: EMAIL,
        date: DATE,
        startTime: '19:00',
        endTime: '21:00',
        numberOfPeople: '4',
    },
    metadata: {stream_name: STREAM},
});

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
                'e_mail as eMail',
                'date',
                'start_time as startTime',
                'end_time as endTime',
                'number_of_people as numberOfPeople',
                'auto_seating_outcome as autoSeatingOutcome',
            )
            .where({reservation_code: reservationCode})
            .first();
    } finally {
        await queryDb.destroy();
    }
};

describe('AutoSeatingCandidates Specification', () => {
    let postgres: StartedPostgreSqlContainer;
    let connectionString: string;
    let db: Knex;
    let given: PostgreSQLProjectionSpec<any>;

    before(async () => {
        postgres = await new PostgreSqlContainer('postgres').start();
        connectionString = postgres.getConnectionUri();
        db = knex({client: 'pg', connection: connectionString});
        await runFlywayMigrations(connectionString);
        given = PostgreSQLProjectionSpec.for({projection: AutoSeatingCandidatesProjection, connectionString});
    });

    after(async () => {
        await db?.destroy();
        await postgres?.stop();
    });

    it('spec: A new reservation enters the queue waiting for a table', async () => {
        const code = 'R-7K2Q';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await rowFor(connStr, code);

            assert.ok(row, 'row should exist');
            assert.strictEqual(row.reservationCode, code);
            assert.strictEqual(row.eMail, EMAIL);
            assert.strictEqual(row.date, DATE);
            assert.strictEqual(row.startTime, '19:00');
            assert.strictEqual(row.endTime, '21:00');
            assert.strictEqual(row.numberOfPeople, '4');
            assert.strictEqual(row.autoSeatingOutcome, 'Pending');
        };

        await given([placed(code)]).when([]).then(assertReadModel);
    });

    it('spec: A reservation whose table was already held drops out of the queue', async () => {
        const code = 'R-HLD1';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await rowFor(connStr, code);

            assert.ok(row, 'row should exist');
            assert.strictEqual(row.autoSeatingOutcome, 'Held');
        };

        await given([placed(code), held(code)]).when([]).then(assertReadModel);
    });

    it('spec: A released hold puts the reservation back in the queue', async () => {
        const code = 'R-REL1';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await rowFor(connStr, code);

            assert.ok(row, 'row should exist');
            assert.strictEqual(row.autoSeatingOutcome, 'Failed');
        };

        await given([placed(code), held(code), released(code)]).when([]).then(assertReadModel);
    });
});
