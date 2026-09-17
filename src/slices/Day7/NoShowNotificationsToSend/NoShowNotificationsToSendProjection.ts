import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {sql, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import {
    type NoShowNotificationSent,
    type ReservationReleasedAsNoShow,
} from '../Day7Events';

export const tableName = 'day7_no_show_notifications_to_send';

export type NoShowNotificationsToSendReadModel = {
    reservationCode: string;
    eMail: string;
    date: string;
    startTime: string;
};

export const getKnexInstance = (): Knex => knex({client: 'pg'});

type NoShowNotificationsToSendEvents = ReservationReleasedAsNoShow | NoShowNotificationSent;

export const NoShowNotificationsToSendProjection =
    postgreSQLRawSQLProjection<NoShowNotificationsToSendEvents>({
        name: 'NoShowNotificationsToSendProjection',
        canHandle: ['ReservationReleasedAsNoShow', 'NoShowNotificationSent'],
        evolve: async (event): Promise<SQL[]> => {
            const db = getKnexInstance();

            switch (event.type) {
                case 'ReservationReleasedAsNoShow':
                    return [sql(db(tableName)
                        .withSchema('public')
                        .insert({
                            reservation_code: event.data.reservationCode,
                            e_mail: event.data.eMail,
                            date: event.data.date,
                            start_time: event.data.startTime,
                        })
                        .onConflict('reservation_code')
                        .merge(['e_mail', 'date', 'start_time'])
                        .toQuery())];

                // The emitted event closes back onto the queue it was drained from, so the
                // guest is not notified twice.
                case 'NoShowNotificationSent':
                    return [sql(db(tableName)
                        .withSchema('public')
                        .where({reservation_code: event.data.reservationCode})
                        .delete()
                        .toQuery())];

                default:
                    return [];
            }
        },
    });
