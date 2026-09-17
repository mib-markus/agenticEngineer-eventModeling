import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    BlockTableCommand,
    BlockTableInitialState,
    TableHold,
    decide,
    evolve,
} from './BlockTableCommand';

describe('BlockTable Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: BlockTableInitialState,
    });

    const EMAIL = 'max.mustermann@gmx.de';
    const DATE = '15.04.2026';

    const command = (
        startTime: string,
        endTime: string,
        reason: string,
        tableHolds: TableHold[] = [],
    ): BlockTableCommand => ({
        type: 'BlockTable',
        data: {tableNumber: '12', date: DATE, startTime, endTime, reason},
        metadata: {tableHolds},
    });

    const confirmed = (reservationCode: string, startTime = '19:00', endTime = '21:00') => ({
        type: 'ReservationConfirmed' as const,
        data: {reservationCode, tableNumber: '12', eMail: EMAIL, date: DATE, startTime, endTime},
        metadata: {},
    });

    const blocked = (startTime: string, endTime: string, reason: string) => ({
        type: 'TableBlocked' as const,
        data: {tableNumber: '12', date: DATE, startTime, endTime, reason},
        metadata: {},
    });

    it('spec: Block a free table for a private event', () => {
        given([])
            .when(command('14:00', '17:00', 'Private event'))
            .then([{
                type: 'TableBlocked',
                data: {
                    tableNumber: '12',
                    date: DATE,
                    startTime: '14:00',
                    endTime: '17:00',
                    reason: 'Private event',
                },
                metadata: {},
            }]);
    });

    it('spec: Block a table outside the hours an existing reservation holds it', () => {
        given([confirmed('R-7K2Q')])
            .when(command('14:00', '17:00', 'Maintenance'))
            .then([{
                type: 'TableBlocked',
                data: {
                    tableNumber: '12',
                    date: DATE,
                    startTime: '14:00',
                    endTime: '17:00',
                    reason: 'Maintenance',
                },
                metadata: {},
            }]);
    });

    it('spec: Reject blocking a table that an active reservation holds at an overlapping time', () => {
        given([confirmed('R-7K2Q')])
            .when(command('20:00', '22:00', 'Maintenance'))
            .thenThrows((error: any) => error.code === 'table_held_by_reservation');
    });

    it('spec: Block a table whose only reservation was cancelled', () => {
        given([
            confirmed('R-7K2Q'),
            {
                type: 'ReservationCancelled' as const,
                data: {
                    reservationCode: 'R-7K2Q',
                    eMail: EMAIL,
                    date: DATE,
                    startTime: '19:00',
                    tableNumber: '12',
                },
                metadata: {},
            },
        ])
            .when(command('19:00', '21:00', 'Private event'))
            .then([{
                type: 'TableBlocked',
                data: {
                    tableNumber: '12',
                    date: DATE,
                    startTime: '19:00',
                    endTime: '21:00',
                    reason: 'Private event',
                },
                metadata: {},
            }]);
    });

    it('spec: Reject blocking the same table twice at an overlapping time', () => {
        given([blocked('14:00', '17:00', 'Private event')])
            .when(command('16:00', '18:00', 'Maintenance'))
            .thenThrows((error: any) => error.code === 'table_already_blocked');
    });

    it('holds supplied by the route reject an overlapping block just as stream events do', () => {
        // A confirmed reservation lives on the guest's own stream, so the table's stream is
        // empty and only the route-supplied holds can catch the clash.
        given([])
            .when(command('20:00', '22:00', 'Maintenance', [{
                reservationCode: 'R-7K2Q',
                tableNumber: '12',
                date: DATE,
                startTime: '19:00',
                endTime: '21:00',
            }]))
            .thenThrows((error: any) => error.code === 'table_held_by_reservation');
    });
});
