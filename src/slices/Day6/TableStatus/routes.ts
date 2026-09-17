import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {TableStatusReadModel, tableName} from './TableStatusProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/query/tablestatus-collection:
     *   get:
     *     tags: [Day6]
     *     summary: TableStatus
     *     description: >
     *       Which tables are held on a service day, and for whom. Only confirmed
     *       reservations hold a table — a placed but unconfirmed reservation is not
     *       listed here, and cancelling frees the table again.
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
     *         description: The TableStatus read model
     *         content:
     *           application/json:
     *             schema:
     *               oneOf:
     *                 - $ref: '#/components/schemas/TableStatusReadModel'
     *                 - type: array
     *                   items:
     *                     $ref: '#/components/schemas/TableStatusReadModel'
     *       '500':
     *         description: Server error
     * components:
     *   schemas:
     *     TableStatusReadModel:
     *       type: object
     *       properties:
     *         tableNumber:
     *           type: string
     *           example: '12'
     *         date:
     *           type: string
     *           example: 15.04.2026
     *         reservationCode:
     *           type: string
     *           example: R-7K2Q
     *         startTime:
     *           type: string
     *           example: '19:00'
     *         endTime:
     *           type: string
     *           example: '21:00'
     *         numberOfPeople:
     *           type: string
     *           example: '4'
     */
    router.get('/api/query/tablestatus-collection', async (req: Request, res: Response) => {
        try {
            const db = getKnexInstance();
            const reservationCode = req.query._id?.toString();
            const date = req.query.date?.toString();

            const query = db(tableName)
                .withSchema('public')
                .select(
                    'reservation_code as reservationCode',
                    'table_number as tableNumber',
                    'date',
                    'start_time as startTime',
                    'end_time as endTime',
                    'number_of_people as numberOfPeople',
                )
                // A table is only held once it has been assigned by a confirmation.
                .whereNotNull('table_number');

            if (date) query.where({date});

            if (reservationCode) {
                const row: TableStatusReadModel | undefined = await query
                    .where({reservation_code: reservationCode})
                    .first();
                return res.status(200).json(row ?? null);
            }

            const rows: TableStatusReadModel[] = await query.orderBy('table_number');
            return res.status(200).json(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ok: false, error: 'Server error'});
        }
    });
};
