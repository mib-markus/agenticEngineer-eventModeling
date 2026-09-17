import {after, before, describe, it} from 'node:test';
import assert from 'assert';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import knex, {Knex} from 'knex';
import {TableStatusProjection, tableName} from './TableStatusProjection';
import {runFlywayMigrations} from '../../../common/testHelpers';

const EMAIL = 'max.mustermann@gmx.de';
const DATE = '15.04.2026';
const STREAM = `Day6-${EMAIL}`;

const placed = (reservationCode: string, numberOfPeople = '4') => ({
    type: 'ReservationPlaced' as const,
    data: {
        reservationCode,
        eMail: EMAIL,
        date: DATE,
        startTime: '19:00',
        endTime: '21:00',
        numberOfPeople,
    },
    metadata: {stream_name: STREAM},
});

const confirmed = (reservationCode: string, tableNumber: string) => ({
    type: 'ReservationConfirmed' as const,
    data: {
        reservationCode,
        tableNumber,
        eMail: EMAIL,
        date: DATE,
        startTime: '19:00',
        endTime: '21:00',
    },
    metadata: {stream_name: STREAM},
});

const cancelled = (reservationCode: string, tableNumber: string) => ({
    type: 'ReservationCancelled' as const,
    data: {
        reservationCode,
        eMail: EMAIL,
        date: DATE,
        startTime: '19:00',
        tableNumber,
    },
    metadata: {stream_name: STREAM},
});

// Every `it` in a suite shares one database, so an assertion scoped only by date
// would also see rows left behind by earlier tests. Each test uses its own
// reservation code and asserts on that code alone.
const heldTable = async (connStr: string, reservationCode: string) => {
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

describe('TableStatus Specification', () => {
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
            const row = await heldTable(connStr, code);

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
            const row = await heldTable(connStr, code);
            assert.strictEqual(row, undefined, 'placing alone must not hold a table');
        };

        await given([placed(code)]).when([]).then(assertReadModel);
    });

    it('spec: Cancelling frees the table again', async () => {
        const code = 'R-CAN1';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await heldTable(connStr, code);
            assert.strictEqual(row, undefined, 'cancelling must release the table');
        };

        await given([placed(code), confirmed(code, '12'), cancelled(code, '12')])
            .when([])
            .then(assertReadModel);
    });
});

describe('TableStatus Storyline: Life of table 12 on 15.04.2026', () => {
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

    it('spec: table 12 is still free after ReservationPlaced — placing does not hold a table', async () => {
        const code = 'R-SL01';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await heldTable(connStr, code);
            assert.strictEqual(row, undefined, 'table 12 must still be free');
        };

        await given([placed(code)]).when([]).then(assertReadModel);
    });

    it('spec: table 12 is held after ReservationConfirmed', async () => {
        const code = 'R-SL02';

        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const row = await heldTable(connStr, code);

            assert.ok(row, 'table 12 must be held');
            assert.strictEqual(row.table_number, '12');
            assert.strictEqual(row.number_of_people, '4');
        };

        await given([placed(code), confirmed(code, '12')]).when([]).then(assertReadModel);
    });
});
