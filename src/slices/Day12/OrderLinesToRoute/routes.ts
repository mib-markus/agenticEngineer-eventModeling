import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {OrderLinesToRouteReadModel, tableName} from './OrderLinesToRouteProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/query/day12-orderlinestoroute-collection:
     *   get:
     *     tags: [Day12]
     *     summary: OrderLinesToRoute
     *     description: >
     *       Which submitted lines still have to be routed to a station? A line waits here
     *       once its order has been submitted to the kitchen, with its corrected quantity
     *       and wishes, until it is routed to a station.
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
     *         description: The OrderLinesToRoute read model
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items:
     *                 $ref: '#/components/schemas/OrderLinesToRouteReadModel'
     *       '500':
     *         description: Server error
     * components:
     *   schemas:
     *     OrderLinesToRouteReadModel:
     *       type: object
     *       properties:
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
     *         category:
     *           type: string
     *           example: Menu
     */
    router.get('/api/query/day12-orderlinestoroute-collection', async (req: Request, res: Response) => {
        try {
            const db = getKnexInstance();
            const orderNumber = req.query.orderNumber?.toString();

            const query = db(tableName)
                .withSchema('public')
                .select(
                    'order_number as orderNumber',
                    'table_number as tableNumber',
                    'line_number as lineNumber',
                    'item_number as itemNumber',
                    'quantity',
                    'special_wishes as specialWishes',
                    'category',
                );

            if (orderNumber) query.where({order_number: orderNumber});

            const rows: OrderLinesToRouteReadModel[] = await query.orderBy(['order_number', 'line_number']);
            return res.status(200).json(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ok: false, error: 'Server error'});
        }
    });
};
