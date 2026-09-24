import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {DeclinesToRecordReadModel, tableName} from './DeclinesToRecordProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/query/day12-declinestorecord-collection:
     *   get:
     *     tags: [Day12]
     *     summary: DeclinesToRecord
     *     description: >
     *       Which declined card authorizations still have to be recorded as a declined
     *       payment? A row appears only once the provider's AuthorizationDeclined lands
     *       for a requested payment — a request with no answer yet is not a todo. A
     *       recorded decline stays on the list.
     *     parameters:
     *       - in: query
     *         name: _id
     *         required: false
     *         schema:
     *           type: string
     *           format: uuid
     *         description: When set, returns the single row with this paymentId
     *     responses:
     *       '200':
     *         description: The DeclinesToRecord read model
     *         content:
     *           application/json:
     *             schema:
     *               oneOf:
     *                 - $ref: '#/components/schemas/DeclinesToRecordReadModel'
     *                 - type: array
     *                   items:
     *                     $ref: '#/components/schemas/DeclinesToRecordReadModel'
     *       '500':
     *         description: Server error
     * components:
     *   schemas:
     *     DeclinesToRecordReadModel:
     *       type: object
     *       properties:
     *         paymentId:
     *           type: string
     *           format: uuid
     *         orderNumber:
     *           type: string
     *         tableNumber:
     *           type: string
     *         totalAmount:
     *           type: number
     *         declineReason:
     *           type: string
     *         declineCode:
     *           type: string
     *         maskedCardNumber:
     *           type: string
     *         declinedAt:
     *           type: string
     *           format: date-time
     */
    router.get('/api/query/day12-declinestorecord-collection', async (req: Request, res: Response) => {
        try {
            const db = getKnexInstance();
            const paymentId = req.query._id?.toString();

            const query = db(tableName)
                .withSchema('public')
                .select(
                    'payment_id as paymentId',
                    'order_number as orderNumber',
                    'table_number as tableNumber',
                    'total_amount as totalAmount',
                    'decline_reason as declineReason',
                    'decline_code as declineCode',
                    'masked_card_number as maskedCardNumber',
                    'declined_at as declinedAt',
                );

            if (paymentId) {
                const row: DeclinesToRecordReadModel | undefined = await query
                    .where({payment_id: paymentId})
                    .first();
                return res.status(200).json(row ?? null);
            }

            const rows: DeclinesToRecordReadModel[] = await query.orderBy('declined_at');
            return res.status(200).json(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ok: false, error: 'Server error'});
        }
    });
};
