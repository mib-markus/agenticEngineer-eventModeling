import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {
    PaymentSummaryReadModel,
    tableName,
    linesTableName,
    summaryTotals,
    lineTotalOf,
} from './PaymentSummaryProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/query/day12-paymentsummary-collection:
     *   get:
     *     tags: [Day12]
     *     summary: PaymentSummary
     *     description: >
     *       The priced bill shown on the PaymentScreen before a card payment is
     *       requested. A routed line appears with its catalogue price and line total,
     *       flagged once it has been served. Unserved lines are still priced. The
     *       order-level money fields are derived: serviceCharge is 10% of the subtotal,
     *       taxAmount is 8%, and totalAmount is their sum. An order with no routed
     *       lines yields no summary.
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
     *         description: The PaymentSummary read model
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items:
     *                 $ref: '#/components/schemas/PaymentSummaryReadModel'
     *       '500':
     *         description: Server error
     * components:
     *   schemas:
     *     PaymentSummaryReadModel:
     *       type: object
     *       properties:
     *         orderNumber:
     *           type: string
     *         tableNumber:
     *           type: string
     *         lineNumber:
     *           type: array
     *           items:
     *             type: integer
     *             format: int32
     *         itemNumber:
     *           type: array
     *           items:
     *             type: string
     *         quantity:
     *           type: array
     *           items:
     *             type: integer
     *             format: int32
     *         unitPrice:
     *           type: array
     *           items:
     *             type: number
     *         lineTotal:
     *           type: array
     *           items:
     *             type: number
     *         lineServed:
     *           type: array
     *           items:
     *             type: boolean
     *         subtotal:
     *           type: number
     *         serviceCharge:
     *           type: number
     *         taxAmount:
     *           type: number
     *         totalAmount:
     *           type: number
     */
    router.get('/api/query/day12-paymentsummary-collection', async (req: Request, res: Response) => {
        try {
            const db = getKnexInstance();
            const orderNumber = req.query.orderNumber?.toString();

            const headerQuery = db(tableName)
                .withSchema('public')
                .select(
                    'order_number as orderNumber',
                    'table_number as tableNumber',
                );

            if (orderNumber) headerQuery.where({order_number: orderNumber});

            const headers: {orderNumber: string; tableNumber: string}[] =
                await headerQuery.orderBy('order_number');

            const rows: PaymentSummaryReadModel[] = [];
            for (const header of headers) {
                const lines = await db(linesTableName)
                    .withSchema('public')
                    .select(
                        'line_number as lineNumber',
                        'item_number as itemNumber',
                        'quantity',
                        'unit_price as unitPrice',
                        'line_served as lineServed',
                    )
                    .where({order_number: header.orderNumber})
                    .orderBy('line_number');

                rows.push({
                    ...header,
                    lineNumber: lines.map((l) => l.lineNumber),
                    itemNumber: lines.map((l) => l.itemNumber),
                    quantity: lines.map((l) => l.quantity),
                    unitPrice: lines.map((l) => l.unitPrice),
                    lineTotal: lines.map((l) => lineTotalOf(l.unitPrice, l.quantity)),
                    lineServed: lines.map((l) => l.lineServed),
                    ...summaryTotals(lines),
                });
            }

            return res.status(200).json(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ok: false, error: 'Server error'});
        }
    });
};
