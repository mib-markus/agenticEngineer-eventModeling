import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {PayOrderCommand, handlePayOrder} from './PayOrderCommand';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/day12/payorder/{tableNumber}:
     *   post:
     *     tags: [Day12]
     *     summary: Pay Order
     *     description: >
     *       A guest pays the bill from the TableBillScreen. An order with at least one
     *       unserved item cannot be paid, and an already paid order cannot be paid again.
     *     parameters:
     *       - in: path
     *         name: tableNumber
     *         required: true
     *         schema:
     *           type: string
     *           example: '12'
     *         description: The table the order belongs to (the stream this command targets)
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
     *             required: [orderNumber, amountPaid, paymentMethod]
     *             properties:
     *               orderNumber:
     *                 type: string
     *                 example: O-1042
     *               amountPaid:
     *                 type: string
     *                 example: '37.00'
     *               paymentMethod:
     *                 type: string
     *                 example: card
     *     responses:
     *       '201':
     *         description: Accepted — OrderPaid appended
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
     *           unprepared_item — at least one routed line has not been served yet;
     *           already_paid — this order has already been paid
     *       '500':
     *         description: Server error
     */
    router.post('/api/day12/payorder/:tableNumber', async (req: Request, res: Response) => {
        const tableNumber = req.params.tableNumber;
        const orderNumber = req.body?.orderNumber;
        const correlationId = req.header('correlation_id') ?? orderNumber;

        try {
            const command: PayOrderCommand = {
                type: 'PayOrder',
                data: {
                    orderNumber,
                    tableNumber,
                    amountPaid: req.body?.amountPaid,
                    paymentMethod: req.body?.paymentMethod,
                },
                metadata: {
                    paidAt: new Date().toISOString(),
                    correlation_id: correlationId,
                    causation_id: orderNumber,
                },
            };

            const result = await handlePayOrder(tableNumber, command);

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
        case 'unprepared_item':
            return 'At least one routed line has not been served yet, so the bill is not final.';
        case 'already_paid':
            return 'This order has already been paid.';
        default:
            return null;
    }
};
