import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {AddOrderLineCommand, handleAddOrderLine} from './AddOrderLineCommand';
import {findTableNumberByOrderNumber} from './OrderLookupProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/day12/addorderline/{orderNumber}:
     *   post:
     *     tags: [Day12]
     *     summary: Add Order Line
     *     description: >
     *       A menu item or drink is written onto the open pad. The same dish ordered
     *       twice with different wishes becomes two separate lines. Nothing can be
     *       written on a pad that was never opened, and nothing can be added once the
     *       order went to the kitchen.
     *     parameters:
     *       - in: path
     *         name: orderNumber
     *         required: true
     *         schema:
     *           type: string
     *           example: O-1042
     *         description: The open order to write the line onto
     *       - in: header
     *         name: correlation_id
     *         required: false
     *         schema:
     *           type: string
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [itemNumber, quantity, specialWishes]
     *             properties:
     *               itemNumber:
     *                 type: string
     *                 example: M-12
     *               quantity:
     *                 type: integer
     *                 format: int32
     *                 example: 2
     *               specialWishes:
     *                 type: string
     *                 example: without onions
     *     responses:
     *       '201':
     *         description: Accepted — OrderLineAdded appended
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 ok:
     *                   type: boolean
     *                 lineNumber:
     *                   type: integer
     *                   format: int32
     *                 next_expected_stream_version:
     *                   type: string
     *                 last_event_global_position:
     *                   type: string
     *       '409':
     *         description: >
     *           unknown_order — no open order found for this orderNumber;
     *           order_already_submitted — the order was already submitted to the kitchen
     *       '500':
     *         description: Server error
     */
    router.post('/api/day12/addorderline/:orderNumber', async (req: Request, res: Response) => {
        const orderNumber = req.params.orderNumber;
        const correlationId = req.header('correlation_id') ?? orderNumber;

        try {
            const db = getKnexInstance();

            const tableNumber = await findTableNumberByOrderNumber(db, orderNumber);
            if (!tableNumber) {
                return res.status(409).json({error: errorMapping('unknown_order')});
            }

            const command: AddOrderLineCommand = {
                type: 'AddOrderLine',
                data: {
                    orderNumber,
                    itemNumber: req.body?.itemNumber,
                    quantity: req.body?.quantity,
                    specialWishes: req.body?.specialWishes,
                },
                metadata: {
                    correlation_id: correlationId,
                    causation_id: orderNumber,
                },
            };

            const result = await handleAddOrderLine(tableNumber, command);

            res.set('correlation_id', correlationId);
            res.set('causation_id', orderNumber);

            return res.status(201).json({
                ok: true,
                lineNumber: result.lineNumber,
                next_expected_stream_version: result.nextExpectedStreamVersion?.toString(),
                last_event_global_position: result.lastEventGlobalPosition?.toString(),
            });
        } catch (err: any) {
            const errorMessage = errorMapping(err?.code);
            if (errorMessage) {
                return res.status(409).json({error: errorMessage});
            }
            console.error(err);
            return res.status(500).json({ok: false, error: 'Server error'});
        }
    });
};

const errorMapping = (code: string): string | null => {
    switch (code) {
        case 'unknown_order':
            return 'No open order found for this orderNumber.';
        case 'order_already_submitted':
            return 'This order was already submitted to the kitchen.';
        default:
            return null;
    }
};
