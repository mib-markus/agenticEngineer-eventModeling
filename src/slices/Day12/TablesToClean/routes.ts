import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {TablesToCleanReadModel, tableName} from './TablesToCleanProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/query/day12-tablestoclean-collection:
     *   get:
     *     tags: [Day12]
     *     summary: TablesToClean
     *     description: >
     *       Which tables have to be cleaned? A row is seeded once TableClosed lands, and
     *       leaves the list for good once TableFreedForReassignment lands for it.
     *     parameters:
     *       - in: query
     *         name: _id
     *         required: false
     *         schema:
     *           type: string
     *         description: When set, returns the single row with this tableNumber
     *     responses:
     *       '200':
     *         description: The TablesToClean read model
     *         content:
     *           application/json:
     *             schema:
     *               oneOf:
     *                 - $ref: '#/components/schemas/TablesToCleanReadModel'
     *                 - type: array
     *                   items:
     *                     $ref: '#/components/schemas/TablesToCleanReadModel'
     *       '500':
     *         description: Server error
     * components:
     *   schemas:
     *     TablesToCleanReadModel:
     *       type: object
     *       properties:
     *         tableNumber:
     *           type: string
     *           example: '12'
     *         orderNumber:
     *           type: string
     *           example: O-1042
     *         closedAt:
     *           type: string
     *           format: date-time
     *           example: '2026-04-15T20:17:00Z'
     */
    router.get('/api/query/day12-tablestoclean-collection', async (req: Request, res: Response) => {
        try {
            const db = getKnexInstance();
            const tableNumber = req.query._id?.toString();

            const query = db(tableName)
                .withSchema('public')
                .select(
                    'table_number as tableNumber',
                    'order_number as orderNumber',
                    'closed_at as closedAt',
                );

            if (tableNumber) {
                const row: TablesToCleanReadModel | undefined = await query
                    .where({table_number: tableNumber})
                    .first();
                return res.status(200).json(row ?? null);
            }

            const rows: TablesToCleanReadModel[] = await query.orderBy('table_number');
            return res.status(200).json(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ok: false, error: 'Server error'});
        }
    });
};
