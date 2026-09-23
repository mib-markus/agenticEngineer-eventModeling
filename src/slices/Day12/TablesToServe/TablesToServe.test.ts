import {after, before, describe, it} from 'node:test';
import assert from 'assert';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import knex, {Knex} from 'knex';
import {TablesToServeProjection, tableName} from './TablesToServeProjection';
import {runFlywayMigrations} from '../../../common/testHelpers';

const confirmed = (
    reservationCode: string,
    tableNumber: string,
    date: string,
    startTime: string,
    endTime: string,
    eMail = 'max.mustermann@gmx.de',
) => ({
    type: 'ReservationConfirmed' as const,
    data: {
        reservationCode,
        tableNumber,
        eMail,
        date,
        startTime,
        endTime,
    },
    metadata: {stream_name: `Day6-${eMail}`},
});

const rowsFor = async (connStr: string, date: string) => {
    const queryDb = knex({client: 'pg', connection: connStr});
    try {
        return await queryDb(tableName)
            .withSchema('public')
            .select(
                'date',
                'table_number as tableNumber',
                'reservation_code as reservationCode',
                'start_time as startTime',
                'end_time as endTime',
            )
            .where({date})
            .orderBy('table_number');
    } finally {
        await queryDb.destroy();
    }
};

describe('TablesToServe Specification', () => {
    let postgres: StartedPostgreSqlContainer;
    let connectionString: string;
    let db: Knex;
    let given: PostgreSQLProjectionSpec<any>;

    before(async () => {
        postgres = await new PostgreSqlContainer('postgres').start();
        connectionString = postgres.getConnectionUri();
        db = knex({client: 'pg', connection: connectionString});
        await runFlywayMigrations(connectionString);
        given = PostgreSQLProjectionSpec.for({projection: TablesToServeProjection, connectionString});
    });

    after(async () => {
        await db?.destroy();
        await postgres?.stop();
    });

    it('spec: A confirmed reservation puts its table on the server\'s round', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await rowsFor(connStr, '15.04.2026');

            assert.strictEqual(rows.length, 1);
            assert.strictEqual(rows[0].date, '15.04.2026');
            assert.strictEqual(rows[0].tableNumber, '12');
            assert.strictEqual(rows[0].reservationCode, 'R-7K2Q');
            assert.strictEqual(rows[0].startTime, '19:00');
            assert.strictEqual(rows[0].endTime, '21:00');
        };

        await given([confirmed('R-7K2Q', '12', '15.04.2026', '19:00', '21:00')]).when([]).then(assertReadModel);
    });

    it('spec: A day with no confirmed reservations shows no reserved tables', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const rows = await rowsFor(connStr, '16.04.2026');

            assert.strictEqual(rows.length, 0);
        };

        await given([]).when([]).then(assertReadModel);
    });
});
