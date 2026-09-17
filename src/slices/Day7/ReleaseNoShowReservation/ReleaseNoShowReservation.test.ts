import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    ReleaseNoShowReservationCommand,
    ReleaseNoShowReservationInitialState,
    decide,
    evolve,
} from './ReleaseNoShowReservationCommand';

describe('ReleaseNoShowReservation Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: ReleaseNoShowReservationInitialState,
    });

    const EMAIL = 'max.mustermann@gmx.de';
    const DATE = '15.04.2026';
    const CODE = 'R-7K2Q';
    const RELEASED_AT = '15.04.2026 19:15';

    const command = (): ReleaseNoShowReservationCommand => ({
        type: 'ReleaseNoShowReservation',
        data: {
            reservationCode: CODE,
            eMail: EMAIL,
            date: DATE,
            startTime: '19:00',
            tableNumber: '12',
        },
        metadata: {releasedAt: RELEASED_AT},
    });

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

    const released = {
        type: 'ReservationReleasedAsNoShow' as const,
        data: {
            reservationCode: CODE,
            eMail: EMAIL,
            date: DATE,
            startTime: '19:00',
            tableNumber: '12',
            releasedAt: RELEASED_AT,
        },
        metadata: {},
    };

    it('spec: Release a reservation whose grace period expired', () => {
        given([confirmed])
            .when(command())
            .then([{
                type: 'ReservationReleasedAsNoShow',
                data: {
                    reservationCode: CODE,
                    eMail: EMAIL,
                    date: DATE,
                    startTime: '19:00',
                    tableNumber: '12',
                    releasedAt: RELEASED_AT,
                },
                metadata: {},
            }]);
    });

    it('spec: Reject releasing the same reservation twice', () => {
        given([confirmed, released])
            .when(command())
            .thenThrows((error: any) => error.code === 'already_released');
    });

    it('spec: Reject releasing a reservation the guest already cancelled', () => {
        given([
            confirmed,
            {
                type: 'ReservationCancelled' as const,
                data: {
                    reservationCode: CODE,
                    eMail: EMAIL,
                    date: DATE,
                    startTime: '19:00',
                    tableNumber: '12',
                },
                metadata: {},
            },
        ])
            .when(command())
            .thenThrows((error: any) => error.code === 'reservation_cancelled');
    });

    it('rejects releasing a reservation that never held a table', () => {
        given([])
            .when(command())
            .thenThrows((error: any) => error.code === 'reservation_not_confirmed');
    });
});
