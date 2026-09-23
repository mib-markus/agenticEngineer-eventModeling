import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {OrderPadReadModel, tableName, linesTableName} from './OrderPadProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/query/day12-orderpad-collection:
     *   get:
     *     tags: [Day12]
     *     summary: OrderPad
     *     description: >
     *       What is on the pad of this order? The lines a waiter wrote for one order,
     *       whether the pad has already been submitted to the kitchen.
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
     *         description: The OrderPad read model
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items:
     *                 $ref: '#/components/schemas/OrderPadReadModel'
     *       '500':
     *         description: Server error
     * components:
     *   schemas:
     *     OrderPadReadModel:
     *       type: object
     *       properties:
     *         orderNumber:
     *           type: string
     *           example: O-1042
     *         tableNumber:
     *           type: string
     *           example: '12'
     *         serverName:
     *           type: string
     *           example: Anna
     *         lineNumber:
     *           type: array
     *           items:
     *             type: integer
     *             format: int32
     *           example: [1]
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
     *         submitted:
     *           type: boolean
     *           example: false
     */
    router.get('/api/query/day12-orderpad-collection', async (req: Request, res: Response) => {
        try {
            const db = getKnexInstance();
            const orderNumber = req.query.orderNumber?.toString();

            const headerQuery = db(tableName)
                .withSchema('public')
                .select(
                    'order_number as orderNumber',
                    'table_number as tableNumber',
                    'server_name as serverName',
                    'submitted',
                );

            if (orderNumber) headerQuery.where({order_number: orderNumber});

            const headers: Omit<OrderPadReadModel, 'lineNumber' | 'itemNumber' | 'quantity' | 'specialWishes'>[] =
                await headerQuery.orderBy('order_number');

            const rows: OrderPadReadModel[] = [];
            for (const header of headers) {
                const lines = await db(linesTableName)
                    .withSchema('public')
                    .select(
                        'line_number as lineNumber',
                        'item_number as itemNumber',
                        'quantity',
                        'special_wishes as specialWishes',
                    )
                    .where({order_number: header.orderNumber})
                    .orderBy('line_number');

                rows.push({
                    ...header,
                    lineNumber: lines.map((l) => l.lineNumber),
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
