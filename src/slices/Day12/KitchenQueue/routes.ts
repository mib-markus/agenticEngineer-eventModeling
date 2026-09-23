import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {KitchenQueueReadModel, tableName, linesTableName} from './KitchenQueueProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/query/day12-kitchenqueue-collection:
     *   get:
     *     tags: [Day12]
     *     summary: KitchenQueue
     *     description: >
     *       What does the kitchen have to prepare? A submitted order together with the
     *       lines still on it at the moment it was sent to the kitchen. Orders still
     *       being written never appear here.
     *     parameters:
     *       - in: query
     *         name: orderNumber
     *         required: false
     *         schema:
     *           type: string
     *           example: O-1042
     *         description: Restrict to one order
     *     responses:
     *       '200':
     *         description: The KitchenQueue read model
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items:
     *                 $ref: '#/components/schemas/KitchenQueueReadModel'
     *       '500':
     *         description: Server error
     * components:
     *   schemas:
     *     KitchenQueueReadModel:
     *       type: object
     *       properties:
     *         orderNumber:
     *           type: string
     *           example: O-1042
     *         tableNumber:
     *           type: string
     *           example: '12'
     *         submittedAt:
     *           type: string
     *           format: date-time
     *           example: '2026-04-15T19:18:00Z'
     *         itemNumber:
     *           type: array
     *           items:
     *             type: string
     *           example: [M-12]
     *         quantity:
     *           type: array
     *           items:
     *             type: integer
     *             format: int32
     *           example: [2]
     *         specialWishes:
     *           type: array
     *           items:
     *             type: string
     *           example: [without onions]
     */
    router.get('/api/query/day12-kitchenqueue-collection', async (req: Request, res: Response) => {
        try {
            const db = getKnexInstance();
            const orderNumber = req.query.orderNumber?.toString();

            const headerQuery = db(tableName)
                .withSchema('public')
                .select(
                    'order_number as orderNumber',
                    'table_number as tableNumber',
                    'submitted_at as submittedAt',
                );

            if (orderNumber) headerQuery.where({order_number: orderNumber});

            const headers: Omit<KitchenQueueReadModel, 'itemNumber' | 'quantity' | 'specialWishes'>[] =
                await headerQuery.orderBy('order_number');

            const rows: KitchenQueueReadModel[] = [];
            for (const header of headers) {
                const lines = await db(linesTableName)
                    .withSchema('public')
                    .select(
                        'item_number as itemNumber',
                        'quantity',
                        'special_wishes as specialWishes',
                    )
                    .where({order_number: header.orderNumber})
                    .orderBy('line_number');

                rows.push({
                    ...header,
                    itemNumber: lines.map((l) => l.itemNumber),
                    quantity: lines.map((l) => l.quantity),
                    specialWishes: lines.map((l) => l.specialWishes),
                });
            }

            return res.status(200).json(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ok: false, error: 'Server error'});
        }
    });
};
