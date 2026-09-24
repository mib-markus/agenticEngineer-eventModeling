import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {AuthorizationsToRecordReadModel, tableName} from './AuthorizationsToRecordProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/query/day12-authorizationstorecord-collection:
     *   get:
     *     tags: [Day12]
     *     summary: AuthorizationsToRecord
     *     description: >
     *       Which approved card authorizations still have to be recorded as a payment?
     *       A row appears only once the provider's AuthorizationApproved lands for a
     *       requested payment — a request with no answer yet is not a todo. A recorded
     *       authorization stays on the list.
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
     *         description: The AuthorizationsToRecord read model
     *         content:
     *           application/json:
     *             schema:
     *               oneOf:
     *                 - $ref: '#/components/schemas/AuthorizationsToRecordReadModel'
     *                 - type: array
     *                   items:
     *                     $ref: '#/components/schemas/AuthorizationsToRecordReadModel'
     *       '500':
     *         description: Server error
     * components:
     *   schemas:
     *     AuthorizationsToRecordReadModel:
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
     *         tipAmount:
     *           type: number
     *         paymentType:
     *           type: string
     *         authorizationCode:
     *           type: string
     *         cardBrand:
     *           type: string
     *         maskedCardNumber:
     *           type: string
     *         approvedAt:
     *           type: string
     *           format: date-time
     */
    router.get('/api/query/day12-authorizationstorecord-collection', async (req: Request, res: Response) => {
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
                    'tip_amount as tipAmount',
                    'payment_type as paymentType',
                    'authorization_code as authorizationCode',
                    'card_brand as cardBrand',
                    'masked_card_number as maskedCardNumber',
                    'approved_at as approvedAt',
                );

            if (paymentId) {
                const row: AuthorizationsToRecordReadModel | undefined = await query
                    .where({payment_id: paymentId})
                    .first();
                return res.status(200).json(row ?? null);
            }

            const rows: AuthorizationsToRecordReadModel[] = await query.orderBy('approved_at');
            return res.status(200).json(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ok: false, error: 'Server error'});
        }
    });
};
