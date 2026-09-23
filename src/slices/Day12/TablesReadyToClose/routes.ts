import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {TablesReadyToCloseReadModel, tableName} from './TablesReadyToCloseProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/query/day12-tablesreadytoclose-collection:
     *   get:
     *     tags: [Day12]
     *     summary: TablesReadyToClose
     *     description: >
     *       Which tables can be closed? A row is seeded once OrderPaid lands, and leaves
     *       the list for good once TableClosed lands for it.
     *     parameters:
     *       - in: query
     *         name: _id
     *         required: false
     *         schema:
     *           type: string
     *         description: When set, returns the single row with this orderNumber
     *     responses:
     *       '200':
     *         description: The TablesReadyToClose read model
     *         content:
     *           application/json:
     *             schema:
     *               oneOf:
     *                 - $ref: '#/components/schemas/TablesReadyToCloseReadModel'
     *                 - type: array
     *                   items:
     *                     $ref: '#/components/schemas/TablesReadyToCloseReadModel'
     *       '500':
     *         description: Server error
     * components:
     *   schemas:
     *     TablesReadyToCloseReadModel:
     *       type: object
     *       properties:
     *         tableNumber:
     *           type: string
     *           example: '12'
     *         orderNumber:
     *           type: string
     *           example: O-1042
     *         amountPaid:
     *           type: number
     *           example: 37.00
     *         paidAt:
     *           type: string
     *           format: date-time
     *           example: '2026-04-15T20:15:00Z'
     */
    router.get('/api/query/day12-tablesreadytoclose-collection', async (req: Request, res: Response) => {
        try {
            const db = getKnexInstance();
            const orderNumber = req.query._id?.toString();

            const query = db(tableName)
                .withSchema('public')
                .select(
                    'table_number as tableNumber',
                    'order_number as orderNumber',
                    'amount_paid as amountPaid',
                    'paid_at as paidAt',
                );

            if (orderNumber) {
                const row: TablesReadyToCloseReadModel | undefined = await query
                    .where({order_number: orderNumber})
                    .first();
                return res.status(200).json(row ?? null);
            }

            const rows: TablesReadyToCloseReadModel[] = await query.orderBy('order_number');
            return res.status(200).json(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ok: false, error: 'Server error'});
        }
    });
};
