import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {ActiveReservationsReadModel, tableName} from './ActiveReservationsProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/query/activereservations-collection:
     *   get:
     *     tags: [Day6]
     *     summary: ActiveReservations
     *     description: >
     *       A guest's live reservations, looked up by e-mail. A reservation appears as
     *       soon as it is placed and carries no table until staff confirm it; cancelling
     *       removes it from the list.
     *     parameters:
     *       - in: query
     *         name: eMail
     *         required: false
     *         schema:
     *           type: string
     *           example: max.mustermann@gmx.de
     *         description: Restrict to one guest's reservations
     *       - in: query
     *         name: _id
     *         required: false
     *         schema:
     *           type: string
     *           example: R-7K2Q
     *         description: When set, returns the single row with this reservationCode
     *     responses:
     *       '200':
     *         description: The ActiveReservations read model
     *         content:
     *           application/json:
     *             schema:
     *               oneOf:
     *                 - $ref: '#/components/schemas/ActiveReservationsReadModel'
     *                 - type: array
     *                   items:
     *                     $ref: '#/components/schemas/ActiveReservationsReadModel'
     *       '500':
     *         description: Server error
     * components:
     *   schemas:
     *     ActiveReservationsReadModel:
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
     *         tableNumber:
     *           type: string
     *           nullable: true
     *           example: '12'
     */
    router.get('/api/query/activereservations-collection', async (req: Request, res: Response) => {
        try {
            const db = getKnexInstance();
            const reservationCode = req.query._id?.toString();
            const eMail = req.query.eMail?.toString();

            const query = db(tableName)
                .withSchema('public')
                .select(
                    'reservation_code as reservationCode',
                    'e_mail as eMail',
                    'date',
                    'start_time as startTime',
                    'end_time as endTime',
                    'number_of_people as numberOfPeople',
                    'table_number as tableNumber',
                );

            if (eMail) query.where({e_mail: eMail});

            if (reservationCode) {
                const row: ActiveReservationsReadModel | undefined = await query
                    .where({reservation_code: reservationCode})
                    .first();
                return res.status(200).json(row ?? null);
            }

            const rows: ActiveReservationsReadModel[] = await query.orderBy(['date', 'start_time']);
            return res.status(200).json(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ok: false, error: 'Server error'});
        }
    });
};
