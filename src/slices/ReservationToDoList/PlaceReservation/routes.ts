import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {randomInt} from 'node:crypto';
import {PlaceReservationCommand, handlePlaceReservation} from './PlaceReservationCommand';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const generateReservationCode = (): string => {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    return `R-${code}`;
};

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/placereservation/{eMail}:
     *   post:
     *     tags: [ReservationToDoList]
     *     summary: PlaceReservation
     *     description: >
     *       Places a reservation for a guest. The reservationCode is generated at placement —
     *       it is returned here, shown to the guest and used later to cancel.
     *     parameters:
     *       - in: path
     *         name: eMail
     *         required: true
     *         schema:
     *           type: string
     *         description: Guest e-mail — the reservation stream id
     *       - in: header
     *         name: correlation_id
     *         required: false
     *         schema:
     *           type: string
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [date, startTime, endTime, numberOfPeople]
     *             properties:
     *               date:
     *                 type: string
     *                 example: 15.04.2026
     *               startTime:
     *                 type: string
     *                 example: '19:00'
     *               endTime:
     *                 type: string
     *                 example: '21:00'
     *               numberOfPeople:
     *                 type: string
     *                 example: '4'
     *     responses:
     *       '201':
     *         description: Accepted — ReservationPlaced appended
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 ok:
     *                   type: boolean
     *                 reservationCode:
     *                   type: string
     *                 next_expected_stream_version:
     *                   type: string
     *                 last_event_global_position:
     *                   type: string
     *       '409':
     *         description: >
     *           invalid_date — the date is not a valid DD.MM.YYYY date;
     *           date_in_past — the date is in the past;
     *           invalid_time — startTime/endTime are not HH:MM;
     *           end_time_before_start_time — endTime must be after startTime;
     *           invalid_number_of_people — numberOfPeople must be at least 1
     *       '500':
     *         description: Server error
     */
    router.post('/api/placereservation/:eMail', async (req: Request, res: Response) => {
        const eMail = req.params.eMail;
        const correlationId = req.header('correlation_id') ?? eMail;
        const reservationCode = generateReservationCode();

        try {
            const command: PlaceReservationCommand = {
                type: 'PlaceReservation',
                data: {
                    eMail,
                    date: req.body?.date,
                    startTime: req.body?.startTime,
                    endTime: req.body?.endTime,
                    numberOfPeople: req.body?.numberOfPeople,
                },
                metadata: {
                    reservationCode,
                    now: new Date(),
                    correlation_id: correlationId,
                    causation_id: eMail,
                },
            };

            const result = await handlePlaceReservation(eMail, command);

            res.set('correlation_id', correlationId);
            res.set('causation_id', eMail);

            return res.status(201).json({
                ok: true,
                reservationCode,
                next_expected_stream_version: result.nextExpectedStreamVersion?.toString(),
                last_event_global_position: result.lastEventGlobalPosition?.toString(),
            });
        } catch (err: any) {
            const errorMessage = errorMapping(err?.code);
            if (errorMessage) {
                return res.status(409).json({error: errorMessage});
            }
            console.error(err);
            return res.status(500).json({ok: false, error: 'Server error'});
        }
    });
};

const errorMapping = (code: string): string | null => {
    switch (code) {
        case 'invalid_date':
            return 'The date must be given as DD.MM.YYYY.';
        case 'date_in_past':
            return 'The reservation date is in the past.';
        case 'invalid_time':
            return 'startTime and endTime must be given as HH:MM.';
        case 'end_time_before_start_time':
            return 'endTime must be after startTime.';
        case 'invalid_number_of_people':
            return 'numberOfPeople must be at least 1.';
        default:
            return null;
    }
};
