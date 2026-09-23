import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {OrderableItemsReadModel, tableName} from './OrderableItemsProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/query/day12-orderableitems-collection:
     *   get:
     *     tags: [Day12]
     *     summary: OrderableItems
     *     description: >
     *       What can the guest order? The catalogue of menu items and drinks published by
     *       the backoffice for one restaurant. A restaurant with no published catalogue
     *       returns an empty list.
     *     parameters:
     *       - in: query
     *         name: restaurantId
     *         required: false
     *         schema:
     *           type: string
     *           example: rest-1
     *         description: Restrict to one restaurant
     *     responses:
     *       '200':
     *         description: The OrderableItems read model
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items:
     *                 $ref: '#/components/schemas/OrderableItemsReadModel'
     *       '500':
     *         description: Server error
     * components:
     *   schemas:
     *     OrderableItemsReadModel:
     *       type: object
     *       properties:
     *         restaurantId:
     *           type: string
     *           example: rest-1
     *         itemNumber:
     *           type: string
     *           example: M-12
     *         name:
     *           type: string
     *           example: Wiener Schnitzel
     *         category:
     *           type: string
     *           example: Menu
     *         price:
     *           type: number
     *           example: 18.50
     */
    router.get('/api/query/day12-orderableitems-collection', async (req: Request, res: Response) => {
        try {
            const db = getKnexInstance();
            const restaurantId = req.query.restaurantId?.toString();

            const query = db(tableName)
                .withSchema('public')
                .select(
                    'restaurant_id as restaurantId',
                    'item_number as itemNumber',
                    'name',
                    'category',
                    'price',
                );

            if (restaurantId) query.where({restaurant_id: restaurantId});

            const rows: OrderableItemsReadModel[] = await query.orderBy('item_number');
            return res.status(200).json(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ok: false, error: 'Server error'});
        }
    });
};
