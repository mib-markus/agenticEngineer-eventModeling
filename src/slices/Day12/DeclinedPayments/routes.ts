import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {DeclinedPaymentsReadModel, tableName} from './DeclinedPaymentsProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/query/day12-declinedpayments-collection:
     *   get:
     *     tags: [Day12]
     *     summary: DeclinedPayments
     *     description: >
     *       What the server is shown after a card is declined — the order, the amount, the
     *       decline reason, and how many attempts this order has already cost. Keyed on
     *       tableNumber: one row per table, replaced on each new decline. attemptCount
     *       counts PaymentDeclined per orderNumber, so a retry on the same bill counts up
     *       while a new bill at the same table starts again at one. A requested payment
     *       with no decline yet shows nothing.
     *     parameters:
     *       - in: query
     *         name: _id
     *         required: false
     *         schema:
     *           type: string
     *         description: When set, returns the single row for this tableNumber
     *     responses:
     *       '200':
     *         description: The DeclinedPayments read model
     *         content:
     *           application/json:
     *             schema:
     *               oneOf:
     *                 - $ref: '#/components/schemas/DeclinedPaymentsReadModel'
     *                 - type: array
     *                   items:
     *                     $ref: '#/components/schemas/DeclinedPaymentsReadModel'
     *       '500':
     *         description: Server error
     * components:
     *   schemas:
     *     DeclinedPaymentsReadModel:
     *       type: object
     *       properties:
     *         tableNumber:
     *           type: string
     *         paymentId:
     *           type: string
     *           format: uuid
     *         orderNumber:
     *           type: string
     *         totalAmount:
     *           type: number
     *         tipAmount:
     *           type: number
     *         declineReason:
     *           type: string
     *         attemptCount:
     *           type: integer
     *         declinedAt:
     *           type: string
     *           format: date-time
     */
    router.get('/api/query/day12-declinedpayments-collection', async (req: Request, res: Response) => {
        try {
            const db = getKnexInstance();
            const tableNumber = req.query._id?.toString();

            const query = db(tableName)
                .withSchema('public')
                .select(
                    'table_number as tableNumber',
                    'payment_id as paymentId',
                    'order_number as orderNumber',
                    'total_amount as totalAmount',
                    'tip_amount as tipAmount',
                    'decline_reason as declineReason',
                    'attempt_count as attemptCount',
                    'declined_at as declinedAt',
                );

            if (tableNumber) {
                const row: DeclinedPaymentsReadModel | undefined = await query
                    .where({table_number: tableNumber})
                    .first();
                return res.status(200).json(row ?? null);
            }

            const rows: DeclinedPaymentsReadModel[] = await query.orderBy('declined_at');
            return res.status(200).json(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ok: false, error: 'Server error'});
        }
    });
};
