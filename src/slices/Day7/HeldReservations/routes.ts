import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {HeldReservationsReadModel, tableName} from './HeldReservationsProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/query/day7-heldreservations-collection:
     *   get:
     *     tags: [Day7]
     *     summary: HeldReservations
     *     description: >
     *       Holds waiting for their second-step checks (blacklist, upfront-payment details,
     *       hold window). A row is seeded once TableHeldForReservation lands, and leaves the
     *       list for good once either ReservationConfirmed (checks passed) or
     *       TableHoldReleased (checks failed) lands for it.
     *     parameters:
     *       - in: query
     *         name: date
     *         required: false
     *         schema:
     *           type: string
     *           example: 15.04.2026
     *         description: Restrict to one service day
     *       - in: query
     *         name: _id
     *         required: false
     *         schema:
     *           type: string
     *         description: When set, returns the single row with this reservationCode
     *     responses:
     *       '200':
     *         description: The HeldReservations read model
     *         content:
     *           application/json:
     *             schema:
     *               oneOf:
     *                 - $ref: '#/components/schemas/HeldReservationsReadModel'
     *                 - type: array
     *                   items:
     *                     $ref: '#/components/schemas/HeldReservationsReadModel'
     *       '500':
     *         description: Server error
     * components:
     *   schemas:
     *     HeldReservationsReadModel:
     *       type: object
     *       properties:
     *         reservationCode:
     *           type: string
     *           example: R-7K2Q
     *         tableNumber:
     *           type: string
     *           example: '12'
     *         eMail:
     *           type: string
     *           example: max.mustermann@gmx.de
     *         date:
     *           type: string
     *           example: 15.04.2026
     *         startTime:
     *           type: string
     *           example: '19:00'
     *         endTime:
     *           type: string
     *           example: '21:00'
     */
    router.get('/api/query/day7-heldreservations-collection', async (req: Request, res: Response) => {
        try {
            const db = getKnexInstance();
            const reservationCode = req.query._id?.toString();
            const date = req.query.date?.toString();

            const query = db(tableName)
                .withSchema('public')
                .select(
                    'reservation_code as reservationCode',
                    'table_number as tableNumber',
                    'e_mail as eMail',
                    'date',
                    'start_time as startTime',
                    'end_time as endTime',
                );

            if (date) query.where({date});

            if (reservationCode) {
                const row: HeldReservationsReadModel | undefined = await query
                    .where({reservation_code: reservationCode})
                    .first();
                return res.status(200).json(row ?? null);
            }

            const rows: HeldReservationsReadModel[] = await query.orderBy('reservation_code');
            return res.status(200).json(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ok: false, error: 'Server error'});
        }
    });
};
