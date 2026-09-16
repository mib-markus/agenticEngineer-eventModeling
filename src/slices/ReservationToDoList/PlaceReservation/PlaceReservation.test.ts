import {DeciderSpecification} from '@event-driven-io/emmett';
import {
    PlaceReservationCommand,
    PlaceReservationInitialState,
    decide,
    evolve,
} from './PlaceReservationCommand';
import {describe, it} from 'node:test';

describe('PlaceReservation Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: PlaceReservationInitialState,
    });

    // The board's example dates are fixed points in 2026; pinning the clock keeps
    // the "date in the past" rule anchored to them instead of to the wall clock.
    const now = new Date('2026-01-15T12:00:00Z');

    const command = (
        data: PlaceReservationCommand['data'],
        reservationCode: string,
    ): PlaceReservationCommand => ({
        type: 'PlaceReservation',
        data,
        metadata: {reservationCode, now},
    });

    it('spec: Place a reservation successfully', () => {
        given([])
            .when(command({
                eMail: 'max.mustermann@gmx.de',
                date: '15.04.2026',
                startTime: '19:00',
                endTime: '21:00',
                numberOfPeople: '4',
            }, 'R-7K2Q'))
            .then([{
                type: 'ReservationPlaced',
                data: {
                    reservationCode: 'R-7K2Q',
                    eMail: 'max.mustermann@gmx.de',
                    date: '15.04.2026',
                    startTime: '19:00',
                    endTime: '21:00',
                    numberOfPeople: '4',
                },
                metadata: {},
            }]);
    });

    it('spec: Reject a reservation ending before it starts', () => {
        given([])
            .when(command({
                eMail: 'max.mustermann@gmx.de',
                date: '15.04.2026',
                startTime: '19:00',
                endTime: '18:00',
                numberOfPeople: '4',
            }, 'R-7K2Q'))
            .thenThrows((error: any) => error.code === 'end_time_before_start_time');
    });

    it('spec: Reject a reservation for zero people', () => {
        given([])
            .when(command({
                eMail: 'max.mustermann@gmx.de',
                date: '15.04.2026',
                startTime: '19:00',
                endTime: '21:00',
                numberOfPeople: '0',
            }, 'R-7K2Q'))
            .thenThrows((error: any) => error.code === 'invalid_number_of_people');
    });

    it('spec: Reject a reservation in the past', () => {
        given([])
            .when(command({
                eMail: 'max.mustermann@gmx.de',
                date: '01.01.2026',
                startTime: '19:00',
                endTime: '21:00',
                numberOfPeople: '4',
            }, 'R-7K2Q'))
            .thenThrows((error: any) => error.code === 'date_in_past');
    });

    it('spec: Place a second reservation for the same guest on another date', () => {
        given([{
            type: 'ReservationPlaced',
            data: {
                reservationCode: 'R-7K2Q',
                eMail: 'max.mustermann@gmx.de',
                date: '15.04.2026',
                startTime: '19:00',
                endTime: '21:00',
                numberOfPeople: '4',
            },
            metadata: {},
        }])
            .when(command({
                eMail: 'max.mustermann@gmx.de',
                date: '22.04.2026',
                startTime: '20:00',
                endTime: '22:00',
                numberOfPeople: '2',
            }, 'R-9M4P'))
            .then([{
                type: 'ReservationPlaced',
                data: {
                    reservationCode: 'R-9M4P',
                    eMail: 'max.mustermann@gmx.de',
                    date: '22.04.2026',
                    startTime: '20:00',
                    endTime: '22:00',
                    numberOfPeople: '2',
                },
                metadata: {},
            }]);
    });
});
