import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {TablesToServeReadModel, tableName} from './TablesToServeProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/query/day12-tablestoserve-collection:
     *   get:
     *     tags: [Day12]
     *     summary: TablesToServe
     *     description: >
     *       Which tables do I serve today? Every table with a confirmed reservation for the
     *       given date. A day with no confirmed reservations returns an empty list.
     *     parameters:
     *       - in: query
     *         name: date
     *         required: false
     *         schema:
     *           type: string
     *           example: 15.04.2026
     *         description: Restrict to one date
     *     responses:
     *       '200':
     *         description: The TablesToServe read model
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items:
     *                 $ref: '#/components/schemas/TablesToServeReadModel'
     *       '500':
     *         description: Server error
     * components:
     *   schemas:
     *     TablesToServeReadModel:
     *       type: object
     *       properties:
     *         date:
     *           type: string
     *           example: 15.04.2026
     *         tableNumber:
     *           type: string
     *           example: '12'
     *         reservationCode:
     *           type: string
     *           example: R-7K2Q
     *         startTime:
     *           type: string
     *           example: '19:00'
     *         endTime:
     *           type: string
     *           example: '21:00'
     */
    router.get('/api/query/day12-tablestoserve-collection', async (req: Request, res: Response) => {
        try {
            const db = getKnexInstance();
            const date = req.query.date?.toString();

            const query = db(tableName)
                .withSchema('public')
                .select(
                    'date',
                    'table_number as tableNumber',
                    'reservation_code as reservationCode',
                    'start_time as startTime',
                    'end_time as endTime',
                );

            if (date) query.where({date});

            const rows: TablesToServeReadModel[] = await query.orderBy('table_number');
            return res.status(200).json(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ok: false, error: 'Server error'});
        }
    });
};
