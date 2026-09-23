import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {RemoveOrderLineCommand, handleRemoveOrderLine} from './RemoveOrderLineCommand';
import {findTableNumberByOrderNumber} from '../AddOrderLine/OrderLookupProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/day12/removeorderline/{orderNumber}:
     *   post:
     *     tags: [Day12]
     *     summary: Remove Order Line
     *     description: >
     *       A line is struck off an open pad, e.g. because the guest changed their mind
     *       or the waiter wrote it on the wrong pad. A line that is not on the pad, a line
     *       already struck off, or any line on an order that was already submitted to the
     *       kitchen cannot be removed.
     *     parameters:
     *       - in: path
     *         name: orderNumber
     *         required: true
     *         schema:
     *           type: string
     *           example: O-1042
     *         description: The open order whose line is being removed
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
     *             required: [lineNumber, reason]
     *             properties:
     *               lineNumber:
     *                 type: integer
     *                 format: int32
     *                 example: 1
     *               reason:
     *                 type: string
     *                 example: Guest changed their mind
     *     responses:
     *       '201':
     *         description: Accepted — OrderLineRemoved appended
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 ok:
     *                   type: boolean
     *                 next_expected_stream_version:
     *                   type: string
     *                 last_event_global_position:
     *                   type: string
     *       '409':
     *         description: >
     *           line_not_found — the order has no such line;
     *           order_already_submitted — the order was already submitted to the kitchen;
     *           line_already_removed — the line was already struck off
     *       '500':
     *         description: Server error
     */
    router.post('/api/day12/removeorderline/:orderNumber', async (req: Request, res: Response) => {
        const orderNumber = req.params.orderNumber;
        const correlationId = req.header('correlation_id') ?? orderNumber;

        try {
            const db = getKnexInstance();

            const tableNumber = await findTableNumberByOrderNumber(db, orderNumber);
            if (!tableNumber) {
                return res.status(409).json({error: errorMapping('line_not_found')});
            }

            const command: RemoveOrderLineCommand = {
                type: 'RemoveOrderLine',
                data: {
                    orderNumber,
                    lineNumber: req.body?.lineNumber,
                    reason: req.body?.reason,
                },
                metadata: {
                    correlation_id: correlationId,
                    causation_id: orderNumber,
                },
            };

            const result = await handleRemoveOrderLine(tableNumber, command);

            res.set('correlation_id', correlationId);
            res.set('causation_id', orderNumber);

            return res.status(201).json({
                ok: true,
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
        case 'line_not_found':
            return 'This order has no such line.';
        case 'order_already_submitted':
            return 'This order was already submitted to the kitchen.';
        case 'line_already_removed':
            return 'This line was already struck off.';
        default:
            return null;
    }
};
