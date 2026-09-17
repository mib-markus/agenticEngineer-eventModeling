import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {sql, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import {type ReservationPlaced} from '../Day6Events';

export const tableName = 'day6_reservation_lookup';

export const getKnexInstance = (): Knex => knex({client: 'pg'});

// Resolves reservationCode -> eMail so a code-only command can find the
// eMail-keyed stream it needs to replay. It answers "where does this
// reservation live", never "may this command proceed" — the preconditions stay
// in decide(), checked against the replayed events.
export const ReservationLookupProjection = postgreSQLRawSQLProjection<ReservationPlaced>({
    name: 'ReservationLookupProjection',
    canHandle: ['ReservationPlaced'],
    evolve: async (event): Promise<SQL[]> => {
        const db = getKnexInstance();

        return [sql(db(tableName)
            .withSchema('public')
            .insert({
                reservation_code: event.data.reservationCode,
                e_mail: event.data.eMail,
            })
            .onConflict('reservation_code')
            .ignore()
            .toQuery())];
    },
});

export const findEMailByReservationCode = async (
    db: Knex,
    reservationCode: string,
): Promise<string | null> => {
    const row = await db(tableName)
        .withSchema('public')
        .where({reservation_code: reservationCode})
        .select('e_mail')
        .first();

    return row?.e_mail ?? null;
};
