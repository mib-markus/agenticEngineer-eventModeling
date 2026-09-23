import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {ReadyItemsForServerReadModel, tableName} from './ReadyItemsForServerProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/query/day12-readyitemsforserver-collection:
     *   get:
     *     tags: [Day12]
     *     summary: ReadyItemsForServer
     *     description: >
     *       Which ready items does a server have to bring out? A line appears here once
     *       it is marked ready, and leaves once it has been served.
     *     parameters:
     *       - in: query
     *         name: tableNumber
     *         required: false
     *         schema:
     *           type: string
     *           example: '12'
     *         description: Restrict to one table
     *     responses:
     *       '200':
     *         description: The ReadyItemsForServer read model
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items:
     *                 $ref: '#/components/schemas/ReadyItemsForServerReadModel'
     *       '500':
     *         description: Server error
     * components:
     *   schemas:
     *     ReadyItemsForServerReadModel:
     *       type: object
     *       properties:
     *         tableNumber:
     *           type: string
     *           example: '12'
     *         orderNumber:
     *           type: string
     *           example: O-1042
     *         lineNumber:
     *           type: integer
     *           format: int32
     *           example: 1
     *         itemNumber:
     *           type: string
     *           example: M-12
     *         station:
     *           type: string
     *           example: kitchen
     *         readyAt:
     *           type: string
     *           format: date-time
     *           example: '2026-04-15T19:34:00Z'
     */
    router.get('/api/query/day12-readyitemsforserver-collection', async (req: Request, res: Response) => {
        try {
            const db = getKnexInstance();
            const tableNumber = req.query.tableNumber?.toString();

            const query = db(tableName)
                .withSchema('public')
                .select(
                    'table_number as tableNumber',
                    'order_number as orderNumber',
                    'line_number as lineNumber',
                    'item_number as itemNumber',
                    'station',
                    'ready_at as readyAt',
                );

            if (tableNumber) query.where({table_number: tableNumber});

            const rows: ReadyItemsForServerReadModel[] = await query.orderBy(['order_number', 'line_number']);
            return res.status(200).json(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ok: false, error: 'Server error'});
        }
    });
};
