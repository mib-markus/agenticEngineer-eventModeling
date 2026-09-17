import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    SendReservationReminderCommand,
    SendReservationReminderInitialState,
    decide,
    evolve,
} from './SendReservationReminderCommand';

describe('SendReservationReminder Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: SendReservationReminderInitialState,
    });

    const EMAIL = 'max.mustermann@gmx.de';
    const DATE = '15.04.2026';
    const CODE = 'R-7K2Q';
    const SENT_AT = '15.04.2026 17:01';

    const command = (): SendReservationReminderCommand => ({
        type: 'SendReservationReminder',
        data: {reservationCode: CODE, eMail: EMAIL, date: DATE, startTime: '19:00', tableNumber: '12'},
        metadata: {sentAt: SENT_AT},
    });

    const placed = {
        type: 'ReservationPlaced' as const,
        data: {
            reservationCode: CODE,
            eMail: EMAIL,
            date: DATE,
            startTime: '19:00',
            endTime: '21:00',
            numberOfPeople: '2',
        },
        metadata: {},
    };

    const confirmed = {
        type: 'ReservationConfirmed' as const,
        data: {
            reservationCode: CODE,
            tableNumber: '12',
            eMail: EMAIL,
            date: DATE,
            startTime: '19:00',
            endTime: '21:00',
        },
        metadata: {},
    };

    const reminderSent = {
        type: 'ReservationReminderSent' as const,
        data: {reservationCode: CODE, eMail: EMAIL, sentAt: SENT_AT},
        metadata: {},
    };

    const cancelled = {
        type: 'ReservationCancelled' as const,
        data: {reservationCode: CODE, eMail: EMAIL, date: DATE, startTime: '19:00', tableNumber: '12'},
        metadata: {},
    };

    it('spec: Send the reminder 120 minutes before the reservation', () => {
        given([placed, confirmed])
            .when(command())
            .then([{
                type: 'ReservationReminderSent',
                data: {reservationCode: CODE, eMail: EMAIL, sentAt: SENT_AT},
                metadata: {},
            }]);
    });

    it('spec: Reject sending a reminder twice', () => {
        given([placed, confirmed, reminderSent])
            .when(command())
            .thenThrows((error: any) => error.code === 'reminder_already_sent');
    });

    it('spec: Reject reminding a cancelled reservation', () => {
        given([placed, confirmed, cancelled])
            .when(command())
            .thenThrows((error: any) => error.code === 'reservation_cancelled');
    });
});
