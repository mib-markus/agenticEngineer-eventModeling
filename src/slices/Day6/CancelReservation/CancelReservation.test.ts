import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    CancelReservationCommand,
    CancelReservationInitialState,
    decide,
    evolve,
} from './CancelReservationCommand';

describe('CancelReservation Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: CancelReservationInitialState,
    });

    // The board pins a `now` per scenario because the whole slice is one deadline rule;
    // reading the real clock would make these pass or fail depending on the run date.
    const at = (wallClock: string): Date => {
        const [date, time] = wallClock.split(' ');
        const [day, month, year] = date.split('.');
        const [hours, minutes] = time.split(':');
        return new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes));
    };

    const command = (reservationCode: string, now: string): CancelReservationCommand => ({
        type: 'CancelReservation',
        data: {reservationCode},
        metadata: {now: at(now)},
    });

    const placed = (reservationCode: string, date: string, startTime: string) => ({
        type: 'ReservationPlaced' as const,
        data: {
            reservationCode,
            eMail: 'max.mustermann@gmx.de',
            date,
            startTime,
            endTime: '21:00',
            numberOfPeople: '4',
        },
        metadata: {},
    });

    it('spec: Cancel a reservation well before it starts', () => {
        given([placed('R-7K2Q', '15.04.2026', '19:00')])
            .when(command('R-7K2Q', '15.04.2026 10:00'))
            .then([{
                type: 'ReservationCancelled',
                data: {
                    reservationCode: 'R-7K2Q',
                    eMail: 'max.mustermann@gmx.de',
                    date: '15.04.2026',
                    startTime: '19:00',
                    tableNumber: '',
                },
                metadata: {},
            }]);
    });

    it('spec: Cancel a confirmed reservation and release its table', () => {
        given([
            placed('R-7K2Q', '15.04.2026', '19:00'),
            {
                type: 'ReservationConfirmed',
                data: {
                    reservationCode: 'R-7K2Q',
                    tableNumber: '12',
                    eMail: 'max.mustermann@gmx.de',
                    date: '15.04.2026',
                    startTime: '19:00',
                    endTime: '21:00',
                },
                metadata: {},
            },
        ])
            .when(command('R-7K2Q', '15.04.2026 10:00'))
            .then([{
                type: 'ReservationCancelled',
                data: {
                    reservationCode: 'R-7K2Q',
                    eMail: 'max.mustermann@gmx.de',
                    date: '15.04.2026',
                    startTime: '19:00',
                    // Carried so TableStatus can free table 12 without reading another stream.
                    tableNumber: '12',
                },
                metadata: {},
            }]);
    });

    it('spec: Cancel exactly 2 hours before the start time', () => {
        // The boundary is inclusive — 17:00 for a 19:00 start is still allowed.
        given([placed('R-7K2Q', '15.04.2026', '19:00')])
            .when(command('R-7K2Q', '15.04.2026 17:00'))
            .then([{
                type: 'ReservationCancelled',
                data: {
                    reservationCode: 'R-7K2Q',
                    eMail: 'max.mustermann@gmx.de',
                    date: '15.04.2026',
                    startTime: '19:00',
                    tableNumber: '',
                },
                metadata: {},
            }]);
    });

    it('spec: Reject a cancellation less than 2 hours before the start', () => {
        given([placed('R-7K2Q', '15.04.2026', '19:00')])
            .when(command('R-7K2Q', '15.04.2026 18:30'))
            .thenThrows((error: any) => error.code === 'cancellation_window_closed');
    });

    it('spec: Reject a cancellation after the reservation has started', () => {
        given([placed('R-7K2Q', '15.04.2026', '19:00')])
            .when(command('R-7K2Q', '15.04.2026 20:00'))
            .thenThrows((error: any) => error.code === 'cancellation_window_closed');
    });

    it('spec: Reject cancelling an unknown reservation code', () => {
        given([])
            .when(command('R-XXXX', '15.04.2026 10:00'))
            .thenThrows((error: any) => error.code === 'unknown_reservation_code');
    });

    it('spec: Reject cancelling an already cancelled reservation', () => {
        given([
            placed('R-7K2Q', '15.04.2026', '19:00'),
            {
                type: 'ReservationCancelled',
                data: {
                    reservationCode: 'R-7K2Q',
                    eMail: 'max.mustermann@gmx.de',
                    date: '15.04.2026',
                    startTime: '19:00',
                    tableNumber: '',
                },
                metadata: {},
            },
        ])
            .when(command('R-7K2Q', '15.04.2026 10:00'))
            .thenThrows((error: any) => error.code === 'already_cancelled');
    });
});
