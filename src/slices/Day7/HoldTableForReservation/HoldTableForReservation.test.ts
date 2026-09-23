import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    HoldTableForReservationCommand,
    HoldTableForReservationInitialState,
    decide,
    evolve,
} from './HoldTableForReservationCommand';

describe('HoldTableForReservation Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: HoldTableForReservationInitialState,
    });

    const DATE = '15.04.2026';

    const command = (
        reservationCode: string,
        eMail: string,
        startTime: string,
        endTime: string,
        tableNumber = '12',
    ): HoldTableForReservationCommand => ({
        type: 'HoldTableForReservation',
        data: {reservationCode, tableNumber, eMail, date: DATE, startTime, endTime},
        metadata: {},
    });

    const held = (reservationCode: string, eMail: string, startTime: string, endTime: string) => ({
        type: 'TableHeldForReservation' as const,
        data: {tableNumber: '12', reservationCode, eMail, date: DATE, startTime, endTime},
        metadata: {},
    });

    const released = (reservationCode: string, startTime: string, endTime: string) => ({
        type: 'TableHoldReleased' as const,
        data: {
            tableNumber: '12',
            reservationCode,
            date: DATE,
            startTime,
            endTime,
            reason: 'Guest is on the blacklist',
        },
        metadata: {},
    });

    const blocked = (startTime: string, endTime: string, reason: string) => ({
        type: 'TableBlocked' as const,
        data: {tableNumber: '12', date: DATE, startTime, endTime, reason},
        metadata: {},
    });

    it('spec: Hold a free table for a reservation', () => {
        given([])
            .when(command('R-7K2Q', 'max.mustermann@gmx.de', '19:00', '21:00'))
            .then([{
                type: 'TableHeldForReservation',
                data: {
                    tableNumber: '12',
                    reservationCode: 'R-7K2Q',
                    eMail: 'max.mustermann@gmx.de',
                    date: DATE,
                    startTime: '19:00',
                    endTime: '21:00',
                },
                metadata: {},
            }]);
    });

    it('spec: Reject a second hold on a table already held for an overlapping time', () => {
        given([held('R-7K2Q', 'max.mustermann@gmx.de', '19:00', '21:00')])
            .when(command('R-9M4X', 'erika.musterfrau@gmx.de', '20:00', '22:00'))
            .thenThrows((error: any) => error.code === 'table_already_held');
    });

    it('spec: Hold the same table again once the earlier hold was released', () => {
        given([
            held('R-7K2Q', 'max.mustermann@gmx.de', '19:00', '21:00'),
            released('R-7K2Q', '19:00', '21:00'),
        ])
            .when(command('R-9M4X', 'erika.musterfrau@gmx.de', '19:00', '21:00'))
            .then([{
                type: 'TableHeldForReservation',
                data: {
                    tableNumber: '12',
                    reservationCode: 'R-9M4X',
                    eMail: 'erika.musterfrau@gmx.de',
                    date: DATE,
                    startTime: '19:00',
                    endTime: '21:00',
                },
                metadata: {},
            }]);
    });

    it('spec: Reject a hold on a table the host took out of service', () => {
        given([blocked('18:00', '23:00', 'Private event')])
            .when(command('R-7K2Q', 'max.mustermann@gmx.de', '19:00', '21:00'))
            .thenThrows((error: any) => error.code === 'table_blocked');
    });

    it('spec: Hold the table a second time for the same reservation without a second hold', () => {
        given([held('R-7K2Q', 'max.mustermann@gmx.de', '19:00', '21:00')])
            .when(command('R-7K2Q', 'max.mustermann@gmx.de', '19:00', '21:00'))
            .thenThrows((error: any) => error.code === 'hold_already_exists');
    });
});
