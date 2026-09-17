import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    SendNoShowNotificationCommand,
    SendNoShowNotificationInitialState,
    decide,
    evolve,
} from './SendNoShowNotificationCommand';

describe('SendNoShowNotification Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: SendNoShowNotificationInitialState,
    });

    const EMAIL = 'max.mustermann@gmx.de';
    const DATE = '15.04.2026';
    const CODE = 'R-7K2Q';
    const SENT_AT = '15.04.2026 19:15';

    const command = (): SendNoShowNotificationCommand => ({
        type: 'SendNoShowNotification',
        data: {reservationCode: CODE, eMail: EMAIL, date: DATE, startTime: '19:00'},
        metadata: {sentAt: SENT_AT},
    });

    const released = {
        type: 'ReservationReleasedAsNoShow' as const,
        data: {
            reservationCode: CODE,
            eMail: EMAIL,
            date: DATE,
            startTime: '19:00',
            tableNumber: '12',
            releasedAt: SENT_AT,
        },
        metadata: {},
    };

    it('spec: Notify the guest that the reservation was released', () => {
        given([released])
            .when(command())
            .then([{
                type: 'NoShowNotificationSent',
                data: {reservationCode: CODE, eMail: EMAIL, sentAt: SENT_AT},
                metadata: {},
            }]);
    });

    it('spec: Reject sending a no-show notification twice', () => {
        given([
            released,
            {
                type: 'NoShowNotificationSent' as const,
                data: {reservationCode: CODE, eMail: EMAIL, sentAt: SENT_AT},
                metadata: {},
            },
        ])
            .when(command())
            .thenThrows((error: any) => error.code === 'notification_already_sent');
    });
});
