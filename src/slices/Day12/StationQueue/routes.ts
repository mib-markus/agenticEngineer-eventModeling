import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {StationQueueReadModel, tableName} from './StationQueueProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/query/day12-stationqueue-collection:
     *   get:
     *     tags: [Day12]
     *     summary: StationQueue
     *     description: >
     *       What does this station have to prepare? A routed line waits here, with its
     *       special wishes, until its preparation has started.
     *     parameters:
     *       - in: query
     *         name: station
     *         required: true
     *         schema:
     *           type: string
     *           example: kitchen
     *         description: The station to query
     *     responses:
     *       '200':
     *         description: The StationQueue read model
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items:
     *                 $ref: '#/components/schemas/StationQueueReadModel'
     *       '500':
     *         description: Server error
     * components:
     *   schemas:
     *     StationQueueReadModel:
     *       type: object
     *       properties:
     *         station:
     *           type: string
     *           example: kitchen
     *         orderNumber:
     *           type: string
     *           example: O-1042
     *         tableNumber:
     *           type: string
     *           example: '12'
     *         lineNumber:
     *           type: integer
     *           format: int32
     *           example: 1
     *         itemNumber:
     *           type: string
     *           example: M-12
     *         quantity:
     *           type: integer
     *           format: int32
     *           example: 2
     *         specialWishes:
     *           type: string
     *           example: without onions
     *         routedAt:
     *           type: string
     *           format: date-time
     *           example: '2026-04-15T19:18:05Z'
     */
    router.get('/api/query/day12-stationqueue-collection', async (req: Request, res: Response) => {
        try {
            const db = getKnexInstance();
            const station = req.query.station?.toString();

            const query = db(tableName)
                .withSchema('public')
                .select(
                    'station',
                    'order_number as orderNumber',
                    'table_number as tableNumber',
                    'line_number as lineNumber',
                    'item_number as itemNumber',
                    'quantity',
                    'special_wishes as specialWishes',
                    'routed_at as routedAt',
                );

            if (station) query.where({station});

            const rows: StationQueueReadModel[] = await query.orderBy(['order_number', 'line_number']);
            return res.status(200).json(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ok: false, error: 'Server error'});
        }
    });
};
