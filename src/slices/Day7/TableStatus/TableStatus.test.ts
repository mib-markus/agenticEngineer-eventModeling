import {after, before, describe, it} from 'node:test';
import assert from 'assert';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import knex, {Knex} from 'knex';
import {TableStatusProjection, blockCodeFor, tableName} from './TableStatusProjection';
import {runFlywayMigrations} from '../../../common/testHelpers';

const EMAIL = 'max.mustermann@gmx.de';
const DATE = '15.04.2026';
const STREAM = `Day6-${EMAIL}`;

const placed = (reservationCode: string, numberOfPeople = '4') => ({
    type: 'ReservationPlaced' as const,
    data: {reservationCode, eMail: EMAIL, date: DATE, startTime: '19:00', endTime: '21:00', numberOfPeople},
    metadata: {stream_name: STREAM},
});

const confirmed = (reservationCode: string, tableNumber: string) => ({
    type: 'ReservationConfirmed' as const,
    data: {reservationCode, tableNumber, eMail: EMAIL, date: DATE, startTime: '19:00', endTime: '21:00'},
    metadata: {stream_name: STREAM},
});

const cancelled = (reservationCode: string, tableNumber: string) => ({
    type: 'ReservationCancelled' as const,
    data: {reservationCode, eMail: EMAIL, date: DATE, startTime: '19:00', tableNumber},
    metadata: {stream_name: STREAM},
});

const released = (reservationCode: string, tableNumber: string) => ({
    type: 'ReservationReleasedAsNoShow' as const,
    data: {
        reservationCode,
        eMail: EMAIL,
        date: DATE,
        startTime: '19:00',
        tableNumber,
        releasedAt: '15.04.2026 19:15',
    },
    metadata: {stream_name: STREAM},
});

const blocked = (tableNumber: string, startTime: string, endTime: string, reason = 'Maintenance') => ({
    type: 'TableBlocked' as const,
    data: {tableNumber, date: DATE, startTime, endTime, reason},
    metadata: {stream_name: `Day7-table-${tableNumber}`},
});

// Every `it` in a suite shares one database, so each test scopes its assertion to its
// own holder code rather than to the shared service day.
const occupied = async (connStr: string, reservationCode: string) => {
    const queryDb = knex({client: 'pg', connection: connStr});
    try {
        return await queryDb(tableName)
            .withSchema('public')
            .where({reservation_code: reservationCode})
            .whereNotNull('table_number')
            .first();
    } finally {
        await queryDb.destroy();
    }
};

describe('Day7 TableStatus Specification', () => {
    let postgres: StartedPostgreSqlContainer;
    let connectionString: string;
    let db: Knex;
    let given: PostgreSQLProjectionSpec<any>;

    before(async () => {
        postgres = await new PostgreSqlContainer('postgres').start();
        connectionString = postgres.getConnectionUri();
        db = knex({client: 'pg', connection: connectionString});
        await runFlywayMigrations(connectionString);
        given = PostgreSQLProjectionSpec.for({projection: TableStatusProjection, connectionString});
    });

    after(async () => {
        await db?.destroy();
        await postgres?.stop();
    });

    it('spec: A confirmed reservation holds its table', async () => {
        const code = 'R-7K2Q';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await occupied(connStr, code);

            assert.ok(row, 'the reservation should hold a table');
            assert.strictEqual(row.table_number, '12');
            assert.strictEqual(row.date, DATE);
            assert.strictEqual(row.start_time, '19:00');
            assert.strictEqual(row.end_time, '21:00');
            assert.strictEqual(row.number_of_people, '4');
        };

        await given([placed(code), confirmed(code, '12')]).when([]).then(assertReadModel);
    });

    it('spec: An unconfirmed reservation holds no table', async () => {
        const code = 'R-UNC1';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await occupied(connStr, code);
            assert.strictEqual(row, undefined, 'placing alone must not hold a table');
        };

        await given([placed(code)]).when([]).then(assertReadModel);
    });

    it('spec: Cancelling frees the table again', async () => {
        const code = 'R-CAN1';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await occupied(connStr, code);
            assert.strictEqual(row, undefined, 'cancelling must release the table');
        };

        await given([placed(code), confirmed(code, '12'), cancelled(code, '12')])
            .when([])
            .then(assertReadModel);
    });

    it('a blocked table is occupied even though no guest reserved it', async () => {
        const block = blocked('20', '14:00', '17:00', 'Private event');

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await occupied(connStr, blockCodeFor(block.data));

            assert.ok(row, 'a block must occupy the table');
            assert.strictEqual(row.table_number, '20');
            assert.strictEqual(row.start_time, '14:00');
            assert.strictEqual(row.end_time, '17:00');
            assert.strictEqual(row.number_of_people, null, 'a block has no party size');
        };

        await given([block]).when([]).then(assertReadModel);
    });

    it('the same block delivered twice occupies the table once', async () => {
        const block = blocked('21', '14:00', '17:00');

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const queryDb = knex({client: 'pg', connection: connStr});
            try {
                const rows = await queryDb(tableName)
                    .withSchema('public')
                    .where({table_number: '21', date: DATE});
                assert.strictEqual(rows.length, 1, 'a redelivered block must not add a second row');
            } finally {
                await queryDb.destroy();
            }
        };

        await given([block, block]).when([]).then(assertReadModel);
    });

    it('releasing a no-show frees the table for someone else', async () => {
        const code = 'R-NSH1';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await occupied(connStr, code);
            assert.strictEqual(row, undefined, 'a released no-show must free its table');
        };

        await given([placed(code), confirmed(code, '12'), released(code, '12')])
            .when([])
            .then(assertReadModel);
    });

    it('two blocks on one table in different windows both occupy it', async () => {
        const morning = blocked('22', '09:00', '11:00');
        const evening = blocked('22', '19:00', '21:00');

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const queryDb = knex({client: 'pg', connection: connStr});
            try {
                const rows = await queryDb(tableName)
                    .withSchema('public')
                    .where({table_number: '22', date: DATE})
                    .orderBy('start_time');

                assert.strictEqual(rows.length, 2);
                assert.strictEqual(rows[0].start_time, '09:00');
                assert.strictEqual(rows[1].start_time, '19:00');
            } finally {
                await queryDb.destroy();
            }
        };

        await given([morning, evening]).when([]).then(assertReadModel);
    });
});
