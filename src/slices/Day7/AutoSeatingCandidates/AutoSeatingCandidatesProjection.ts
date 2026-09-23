import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {sql, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import {
    type ReservationPlaced,
    type TableHeldForReservation,
    type TableHoldReleased,
} from '../Day7Events';

export const tableName = 'day7_auto_seating_candidates';

export type AutoSeatingCandidatesReadModel = {
    reservationCode: string;
    eMail: string;
    date: string;
    startTime: string;
    endTime: string;
    numberOfPeople: string;
    autoSeatingOutcome: string;
};

export const getKnexInstance = (): Knex => knex({client: 'pg'});

type AutoSeatingCandidatesEvents = ReservationPlaced | TableHeldForReservation | TableHoldReleased;

export const AutoSeatingCandidatesProjection = postgreSQLRawSQLProjection<AutoSeatingCandidatesEvents>({
    name: 'AutoSeatingCandidatesProjection',
    canHandle: ['ReservationPlaced', 'TableHeldForReservation', 'TableHoldReleased'],
    evolve: async (event): Promise<SQL[]> => {
        const db = getKnexInstance();

        switch (event.type) {
            case 'ReservationPlaced':
                return [sql(db(tableName)
                    .withSchema('public')
                    .insert({
                        reservation_code: event.data.reservationCode,
                        e_mail: event.data.eMail,
                        date: event.data.date,
                        start_time: event.data.startTime,
                        end_time: event.data.endTime,
                        number_of_people: event.data.numberOfPeople,
                        auto_seating_outcome: 'Pending',
                    })
                    .onConflict('reservation_code')
                    .merge(['e_mail', 'date', 'start_time', 'end_time', 'number_of_people'])
                    .toQuery())];

            // A hold takes the reservation out of the queue: it is no longer a candidate
            // for the processor to pick a table for.
            case 'TableHeldForReservation':
                return [sql(db(tableName)
                    .withSchema('public')
                    .where({reservation_code: event.data.reservationCode})
                    .update({auto_seating_outcome: 'Held'})
                    .toQuery())];

            // A released hold failed the second-step checks (blacklist, payment, window),
            // so the row leaves the automated queue for good and stays with staff.
            case 'TableHoldReleased':
                return [sql(db(tableName)
                    .withSchema('public')
                    .where({reservation_code: event.data.reservationCode})
                    .update({auto_seating_outcome: 'Failed'})
                    .toQuery())];

            default:
                return [];
        }
    },
});
