import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    ConfirmHeldReservationCommand,
    ConfirmHeldReservationInitialState,
    decide,
    evolve,
} from './ConfirmHeldReservationCommand';

describe('ConfirmHeldReservation Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: ConfirmHeldReservationInitialState,
    });

    const EMAIL = 'max.mustermann@gmx.de';
    const DATE = '15.04.2026';
    const CODE = 'R-7K2Q';
    const TABLE = '12';

    const command = (): ConfirmHeldReservationCommand => ({
        type: 'ConfirmHeldReservation',
        data: {
            reservationCode: CODE,
            tableNumber: TABLE,
            eMail: EMAIL,
            date: DATE,
            startTime: '19:00',
            endTime: '21:00',
        },
        metadata: {},
    });

    const held = {
        type: 'TableHeldForReservation' as const,
        data: {
            tableNumber: TABLE,
            reservationCode: CODE,
            eMail: EMAIL,
            date: DATE,
            startTime: '19:00',
            endTime: '21:00',
        },
        metadata: {},
    };

    const released = {
        type: 'TableHoldReleased' as const,
        data: {
            tableNumber: TABLE,
            reservationCode: CODE,
            date: DATE,
            startTime: '19:00',
            endTime: '21:00',
            reason: 'Guest is on the blacklist',
        },
        metadata: {},
    };

    const confirmed = {
        type: 'ReservationConfirmed' as const,
        data: {
            reservationCode: CODE,
            tableNumber: TABLE,
            eMail: EMAIL,
            date: DATE,
            startTime: '19:00',
            endTime: '21:00',
        },
        metadata: {},
    };

    it('spec: Confirm a held reservation that passes the checks', () => {
        given([held])
            .when(command())
            .then([{
                type: 'ReservationConfirmed',
                data: {
                    reservationCode: CODE,
                    tableNumber: TABLE,
                    eMail: EMAIL,
                    date: DATE,
                    startTime: '19:00',
                    endTime: '21:00',
                },
                metadata: {},
            }]);
    });

    it('spec: Reject confirming a reservation whose hold was already released', () => {
        given([held, released])
            .when(command())
            .thenThrows((error: any) => error.code === 'hold_already_released');
    });

    it('spec: Reject confirming without a hold at all', () => {
        given([])
            .when(command())
            .thenThrows((error: any) => error.code === 'hold_not_found');
    });

    it('spec: Confirming an already confirmed reservation changes nothing', () => {
        given([held, confirmed])
            .when(command())
            .thenThrows((error: any) => error.code === 'already_confirmed');
    });
});
