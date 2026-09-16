import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type ReservationToDoListEvents} from '../ReservationToDoListEvents';
import {findEventstore} from '../../../common/loadPostgresEventstore';

export type PlaceReservationCommand = Command<'PlaceReservation', {
    eMail: string;
    date: string;
    startTime: string;
    endTime: string;
    numberOfPeople: string;
}, {
    // reservationCode is `generated: true` on the event, and `now` is the clock:
    // both are supplied by the caller so `decide` stays pure and testable.
    reservationCode: string;
    now: Date;
    correlation_id?: string;
    causation_id?: string;
}>;

export type PlaceReservationState = Record<string, never>;

export const PlaceReservationInitialState = (): PlaceReservationState => ({});

export const evolve = (
    state: PlaceReservationState,
    _event: ReservationToDoListEvents,
): PlaceReservationState => state;

const DATE_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

const toDayNumber = (date: string): number | null => {
    const match = DATE_PATTERN.exec(date);
    if (!match) return null;
    const [, day, month, year] = match;
    return Number(year) * 10000 + Number(month) * 100 + Number(day);
};

const toMinutes = (time: string): number | null => {
    const match = TIME_PATTERN.exec(time);
    if (!match) return null;
    const [, hours, minutes] = match;
    return Number(hours) * 60 + Number(minutes);
};

const todayAsDayNumber = (now: Date): number =>
    now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();

export const decide = (
    command: PlaceReservationCommand,
    _state: PlaceReservationState,
): ReservationToDoListEvents[] => {
    const {eMail, date, startTime, endTime, numberOfPeople} = command.data;

    const reservationDay = toDayNumber(date);
    if (reservationDay === null) {
        throw {code: 'invalid_date', message: `${date} is not a valid date (expected DD.MM.YYYY)`};
    }
    if (reservationDay < todayAsDayNumber(command.metadata.now)) {
        throw {code: 'date_in_past', message: `Cannot reserve ${date} - the date is in the past`};
    }

    const start = toMinutes(startTime);
    const end = toMinutes(endTime);
    if (start === null || end === null) {
        throw {code: 'invalid_time', message: 'startTime and endTime must be given as HH:MM'};
    }
    if (end <= start) {
        throw {code: 'end_time_before_start_time', message: `endTime ${endTime} must be after startTime ${startTime}`};
    }

    if (!/^\d+$/.test(numberOfPeople) || Number(numberOfPeople) < 1) {
        throw {code: 'invalid_number_of_people', message: 'numberOfPeople must be at least 1'};
    }

    return [{
        type: 'ReservationPlaced',
        data: {
            reservationCode: command.metadata.reservationCode,
            eMail,
            date,
            startTime,
            endTime,
            numberOfPeople,
        },
        metadata: {
            correlation_id: command.metadata.correlation_id,
            causation_id: command.metadata.causation_id,
        },
    }];
};

const PlaceReservationCommandHandler = CommandHandler<PlaceReservationState, ReservationToDoListEvents>({
    evolve,
    initialState: PlaceReservationInitialState,
});

export const streamNameFor = (eMail: string) => `ReservationToDoList-${eMail}`;

export const handlePlaceReservation = async (eMail: string, command: PlaceReservationCommand) => {
    const eventStore = await findEventstore();
    const result = await PlaceReservationCommandHandler(
        eventStore,
        streamNameFor(eMail),
        (state: PlaceReservationState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
