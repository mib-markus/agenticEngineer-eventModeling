import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {TableBillReadModel, tableName, linesTableName} from './TableBillProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/query/day12-tablebill-collection:
     *   get:
     *     tags: [Day12]
     *     summary: TableBill
     *     description: >
     *       What does this table owe? A routed line appears on the bill with its price,
     *       marked as served once it has been served. An order with no routed lines has
     *       no bill.
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
     *         description: The TableBill read model
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items:
     *                 $ref: '#/components/schemas/TableBillReadModel'
     *       '500':
     *         description: Server error
     * components:
     *   schemas:
     *     TableBillReadModel:
     *       type: object
     *       properties:
     *         orderNumber:
     *           type: string
     *           example: O-1042
     *         tableNumber:
     *           type: string
     *           example: '12'
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
     *         lineServed:
     *           type: array
     *           items:
     *             type: boolean
     *           example: [false]
     *         unitPrice:
     *           type: array
     *           items:
     *             type: number
     *           example: [18.50]
     *         totalAmount:
     *           type: number
     *           example: 37.00
     */
    router.get('/api/query/day12-tablebill-collection', async (req: Request, res: Response) => {
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

            const headers: Omit<TableBillReadModel, 'lineNumber' | 'itemNumber' | 'quantity' | 'lineServed' | 'unitPrice' | 'totalAmount'>[] =
                await headerQuery.orderBy('order_number');

            const rows: TableBillReadModel[] = [];
            for (const header of headers) {
                const lines = await db(linesTableName)
                    .withSchema('public')
                    .select(
                        'line_number as lineNumber',
                        'item_number as itemNumber',
                        'quantity',
                        'line_served as lineServed',
                        'unit_price as unitPrice',
                    )
                    .where({order_number: header.orderNumber})
                    .orderBy('line_number');

                const totalAmount = lines
                    .reduce((sum, l) => sum + Number(l.unitPrice) * l.quantity, 0)
                    .toFixed(2);

                rows.push({
                    ...header,
                    lineNumber: lines.map((l) => l.lineNumber),
                    itemNumber: lines.map((l) => l.itemNumber),
                    quantity: lines.map((l) => l.quantity),
                    lineServed: lines.map((l) => l.lineServed),
                    unitPrice: lines.map((l) => l.unitPrice),
                    totalAmount,
                });
            }

            return res.status(200).json(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ok: false, error: 'Server error'});
        }
    });
};
