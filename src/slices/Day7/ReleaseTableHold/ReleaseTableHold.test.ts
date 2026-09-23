import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    ReleaseTableHoldCommand,
    ReleaseTableHoldInitialState,
    decide,
    evolve,
} from './ReleaseTableHoldCommand';

describe('ReleaseTableHold Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: ReleaseTableHoldInitialState,
    });

    const EMAIL = 'max.mustermann@gmx.de';
    const DATE = '15.04.2026';
    const CODE = 'R-7K2Q';
    const TABLE = '12';

    const command = (reason: string): ReleaseTableHoldCommand => ({
        type: 'ReleaseTableHold',
        data: {
            tableNumber: TABLE,
            reservationCode: CODE,
            date: DATE,
            startTime: '19:00',
            endTime: '21:00',
            reason,
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

    const released = (reason: string) => ({
        type: 'TableHoldReleased' as const,
        data: {
            tableNumber: TABLE,
            reservationCode: CODE,
            date: DATE,
            startTime: '19:00',
            endTime: '21:00',
            reason,
        },
        metadata: {},
    });

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

    it('spec: Release the table when the guest is on the blacklist', () => {
        given([held])
            .when(command('Guest is on the blacklist'))
            .then([{
                type: 'TableHoldReleased',
                data: {
                    tableNumber: TABLE,
                    reservationCode: CODE,
                    date: DATE,
                    startTime: '19:00',
                    endTime: '21:00',
                    reason: 'Guest is on the blacklist',
                },
                metadata: {},
            }]);
    });

    it('spec: Release the table when the upfront payment details are not valid', () => {
        given([held])
            .when(command('Upfront payment details could not be validated'))
            .then([{
                type: 'TableHoldReleased',
                data: {
                    tableNumber: TABLE,
                    reservationCode: CODE,
                    date: DATE,
                    startTime: '19:00',
                    endTime: '21:00',
                    reason: 'Upfront payment details could not be validated',
                },
                metadata: {},
            }]);
    });

    it('spec: Reject releasing a hold that does not exist', () => {
        given([])
            .when(command('Guest is on the blacklist'))
            .thenThrows((error: any) => error.code === 'hold_not_found');
    });

    it('spec: Reject releasing a hold that was already released', () => {
        given([held, released('Guest is on the blacklist')])
            .when(command('Guest is on the blacklist'))
            .thenThrows((error: any) => error.code === 'hold_already_released');
    });

    it('spec: Reject releasing a hold for a reservation that is already confirmed', () => {
        given([held, confirmed])
            .when(command('Guest is on the blacklist'))
            .thenThrows((error: any) => error.code === 'reservation_already_confirmed');
    });
});
