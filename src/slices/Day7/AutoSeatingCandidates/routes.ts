import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {AutoSeatingCandidatesReadModel, tableName} from './AutoSeatingCandidatesProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/query/day7-autoseatingcandidates-collection:
     *   get:
     *     tags: [Day7]
     *     summary: AutoSeatingCandidates
     *     description: >
     *       Reservations still waiting for a table, driving the auto-seating processor.
     *       A row starts Pending when the reservation is placed, moves to Held once a
     *       table hold lands for it, and moves to Failed once that hold is released —
     *       Failed rows leave the automated queue and stay with staff for manual
     *       confirmation.
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
     *         description: The AutoSeatingCandidates read model
     *         content:
     *           application/json:
     *             schema:
     *               oneOf:
     *                 - $ref: '#/components/schemas/AutoSeatingCandidatesReadModel'
     *                 - type: array
     *                   items:
     *                     $ref: '#/components/schemas/AutoSeatingCandidatesReadModel'
     *       '500':
     *         description: Server error
     * components:
     *   schemas:
     *     AutoSeatingCandidatesReadModel:
     *       type: object
     *       properties:
     *         reservationCode:
     *           type: string
     *           example: R-7K2Q
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
     *         numberOfPeople:
     *           type: string
     *           example: '4'
     *         autoSeatingOutcome:
     *           type: string
     *           example: Pending
     */
    router.get('/api/query/day7-autoseatingcandidates-collection', async (req: Request, res: Response) => {
        try {
            const db = getKnexInstance();
            const reservationCode = req.query._id?.toString();
            const date = req.query.date?.toString();

            const query = db(tableName)
                .withSchema('public')
                .select(
                    'reservation_code as reservationCode',
                    'e_mail as eMail',
                    'date',
                    'start_time as startTime',
                    'end_time as endTime',
                    'number_of_people as numberOfPeople',
                    'auto_seating_outcome as autoSeatingOutcome',
                );

            if (date) query.where({date});

            if (reservationCode) {
                const row: AutoSeatingCandidatesReadModel | undefined = await query
                    .where({reservation_code: reservationCode})
                    .first();
                return res.status(200).json(row ?? null);
            }

            const rows: AutoSeatingCandidatesReadModel[] = await query.orderBy('reservation_code');
            return res.status(200).json(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ok: false, error: 'Server error'});
        }
    });
};
