import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {CancelReservationCommand, handleCancelReservation} from './CancelReservationCommand';
import {findEMailByReservationCode} from '../ConfirmReservation/ReservationLookupProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/day6/cancelreservation/{reservationCode}:
     *   post:
     *     tags: [Day6]
     *     summary: CancelReservation
     *     description: >
     *       Cancels a reservation. The guest picks their row from the ActiveReservations
     *       list, which knows only the reservation code, so the code is the path parameter
     *       and the only input this command takes. Cancellation closes 120 minutes before
     *       the reservation starts.
     *     parameters:
     *       - in: path
     *         name: reservationCode
     *         required: true
     *         schema:
     *           type: string
     *           example: R-7K2Q
     *         description: The reservation to cancel
     *       - in: header
     *         name: correlation_id
     *         required: false
     *         schema:
     *           type: string
     *     responses:
     *       '201':
     *         description: Accepted — ReservationCancelled appended
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 ok:
     *                   type: boolean
     *                 next_expected_stream_version:
     *                   type: string
     *                 last_event_global_position:
     *                   type: string
     *       '409':
     *         description: >
     *           unknown_reservation_code — no reservation exists for this code;
     *           already_cancelled — the reservation was already cancelled;
     *           cancellation_window_closed — less than 120 minutes remain before the start
     *       '500':
     *         description: Server error
     */
    router.post('/api/day6/cancelreservation/:reservationCode', async (req: Request, res: Response) => {
        const reservationCode = req.params.reservationCode;
        const correlationId = req.header('correlation_id') ?? reservationCode;

        try {
            const db = getKnexInstance();

            const eMail = await findEMailByReservationCode(db, reservationCode);
            if (!eMail) {
                return res.status(409).json({error: 'No reservation is known under this code.'});
            }

            const command: CancelReservationCommand = {
                type: 'CancelReservation',
                data: {reservationCode},
                metadata: {
                    now: new Date(),
                    correlation_id: correlationId,
                    causation_id: reservationCode,
                },
            };

            const result = await handleCancelReservation(eMail, command);

            res.set('correlation_id', correlationId);
            res.set('causation_id', reservationCode);

            return res.status(201).json({
                ok: true,
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
        case 'unknown_reservation_code':
            return 'No reservation found for this code.';
        case 'already_cancelled':
            return 'This reservation has already been cancelled.';
        case 'cancellation_window_closed':
            return 'Cancellation closes 2 hours before the reservation starts.';
        default:
            return null;
    }
};
