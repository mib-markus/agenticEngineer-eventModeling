import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    ConfirmReservationCommand,
    ConfirmReservationInitialState,
    TableHold,
    decide,
    evolve,
} from './ConfirmReservationCommand';

describe('ConfirmReservation Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: ConfirmReservationInitialState,
    });

    const EMAIL = 'max.mustermann@gmx.de';
    const DATE = '15.04.2026';

    const command = (
        reservationCode: string,
        tableNumber: string,
        tableHolds: TableHold[] = [],
    ): ConfirmReservationCommand => ({
        type: 'ConfirmReservation',
        data: {reservationCode, tableNumber},
        metadata: {tableHolds},
    });

    const placed = (reservationCode: string, startTime = '19:00', endTime = '21:00') => ({
        type: 'ReservationPlaced' as const,
        data: {
            reservationCode,
            eMail: EMAIL,
            date: DATE,
            startTime,
            endTime,
            numberOfPeople: '4',
        },
        metadata: {},
    });

    const confirmedEvent = (reservationCode: string, tableNumber: string, startTime = '19:00', endTime = '21:00') => ({
        type: 'ReservationConfirmed' as const,
        data: {
            reservationCode,
            tableNumber,
            eMail: EMAIL,
            date: DATE,
            startTime,
            endTime,
        },
        metadata: {},
    });

    it('spec: Confirm a reservation by assigning a table', () => {
        given([placed('R-7K2Q')])
            .when(command('R-7K2Q', '12'))
            .then([{
                type: 'ReservationConfirmed',
                data: {
                    reservationCode: 'R-7K2Q',
                    tableNumber: '12',
                    eMail: EMAIL,
                    date: DATE,
                    startTime: '19:00',
                    endTime: '21:00',
                },
                metadata: {},
            }]);
    });

    it('spec: Reject confirming an unknown reservation code', () => {
        given([])
            .when(command('R-XXXX', '12'))
            .thenThrows((error: any) => error.code === 'unknown_reservation_code');
    });

    it('spec: Reject confirming the same reservation twice', () => {
        given([placed('R-7K2Q'), confirmedEvent('R-7K2Q', '12')])
            .when(command('R-7K2Q', '15'))
            .thenThrows((error: any) => error.code === 'already_confirmed');
    });

    it('spec: Reject confirming a cancelled reservation', () => {
        given([
            placed('R-7K2Q'),
            {
                type: 'ReservationCancelled' as const,
                data: {
                    reservationCode: 'R-7K2Q',
                    eMail: EMAIL,
                    date: DATE,
                    startTime: '19:00',
                    tableNumber: '',
                },
                metadata: {},
            },
        ])
            .when(command('R-7K2Q', '12'))
            .thenThrows((error: any) => error.code === 'reservation_cancelled');
    });

    it('spec: Reject a table already held at an overlapping time', () => {
        // R-7K2Q holds table 12 for 19:00-21:00; R-9M4P wants the same table 20:00-22:00.
        given([
            placed('R-7K2Q'),
            confirmedEvent('R-7K2Q', '12'),
            placed('R-9M4P', '20:00', '22:00'),
        ])
            .when(command('R-9M4P', '12'))
            .thenThrows((error: any) => error.code === 'table_already_held');
    });
});
