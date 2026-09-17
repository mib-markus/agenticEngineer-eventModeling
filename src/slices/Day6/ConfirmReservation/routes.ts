import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {ConfirmReservationCommand, TableHold, handleConfirmReservation} from './ConfirmReservationCommand';
import {findEMailByReservationCode} from './ReservationLookupProjection';
import {tableName as tableStatusTable} from '../TableStatus/TableStatusProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/confirmreservation/{reservationCode}:
     *   post:
     *     tags: [Day6]
     *     summary: ConfirmReservation
     *     description: >
     *       Confirms a reservation by assigning a table to it. Staff pick the row from
     *       the ReservationsToConfirm list, which knows only the reservation code, so the
     *       code is the path parameter here. The table number is trusted staff input —
     *       it is not checked against the published table configuration.
     *     parameters:
     *       - in: path
     *         name: reservationCode
     *         required: true
     *         schema:
     *           type: string
     *           example: R-7K2Q
     *         description: The reservation to confirm
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
     *             required: [tableNumber]
     *             properties:
     *               tableNumber:
     *                 type: string
     *                 example: '12'
     *     responses:
     *       '201':
     *         description: Accepted — ReservationConfirmed appended
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
     *           already_confirmed — the reservation already has a table;
     *           reservation_cancelled — the reservation was cancelled;
     *           table_already_held — the table is held at an overlapping time
     *       '500':
     *         description: Server error
     */
    router.post('/api/confirmreservation/:reservationCode', async (req: Request, res: Response) => {
        const reservationCode = req.params.reservationCode;
        const correlationId = req.header('correlation_id') ?? reservationCode;

        try {
            const db = getKnexInstance();

            const eMail = await findEMailByReservationCode(db, reservationCode);
            if (!eMail) {
                // Distinct from the handler's unknown_reservation_code below: there the
                // stream was found but held no such reservation. Keeping the two apart
                // is what makes a stream-id mismatch visible instead of looking like a
                // missing reservation.
                return res.status(409).json({error: 'No reservation is known under this code.'});
            }

            // The overlap rule spans all guests, but the command's stream holds only
            // this guest's reservations — so the holds for the table being assigned
            // are read here and passed in as metadata.
            const tableHolds: TableHold[] = await db(tableStatusTable)
                .withSchema('public')
                .select(
                    'reservation_code as reservationCode',
                    'table_number as tableNumber',
                    'date',
                    'start_time as startTime',
                    'end_time as endTime',
                )
                .where({table_number: req.body?.tableNumber})
                .whereNotNull('table_number');

            const command: ConfirmReservationCommand = {
                type: 'ConfirmReservation',
                data: {
                    reservationCode,
                    tableNumber: req.body?.tableNumber,
                },
                metadata: {
                    tableHolds,
                    correlation_id: correlationId,
                    causation_id: reservationCode,
                },
            };

            const result = await handleConfirmReservation(eMail, command);

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
        case 'already_confirmed':
            return 'This reservation already has a table assigned.';
        case 'reservation_cancelled':
            return 'This reservation was cancelled and cannot be confirmed.';
        case 'table_already_held':
            return 'That table is already held at an overlapping time.';
        default:
            return null;
    }
};
