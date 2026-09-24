import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {AbandonPaymentCommand, handleAbandonPayment} from './AbandonPaymentCommand';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/day12/abandonpayment/{tableNumber}:
     *   post:
     *     tags: [Day12]
     *     summary: Abandon Payment
     *     description: >
     *       After repeated declines the server gives up on the card from the
     *       PaymentDeclinedScreen. The order stays unpaid — it can still be settled another
     *       way. abandonedAt is generated:now() on the event, so it is stamped server-side
     *       and not accepted from the request body.
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
     *             required: [orderNumber, paymentId, abandonReason, serverName]
     *             properties:
     *               orderNumber:
     *                 type: string
     *               paymentId:
     *                 type: string
     *                 format: uuid
     *               abandonReason:
     *                 type: string
     *               serverName:
     *                 type: string
     *     responses:
     *       '201':
     *         description: Accepted — PaymentAbandoned appended
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
     *           already_abandoned — card payment for this order was already abandoned;
     *           payment_not_declined — the pending payment has not been declined yet;
     *           missing_abandon_reason — abandonReason must not be empty
     *       '500':
     *         description: Server error
     */
    router.post('/api/day12/abandonpayment/:tableNumber', async (req: Request, res: Response) => {
        const tableNumber = req.params.tableNumber;
        const orderNumber = req.body?.orderNumber;
        const correlationId = req.header('correlation_id') ?? orderNumber;

        try {
            const command: AbandonPaymentCommand = {
                type: 'AbandonPayment',
                data: {
                    tableNumber,
                    orderNumber,
                    paymentId: req.body?.paymentId,
                    abandonReason: req.body?.abandonReason,
                    serverName: req.body?.serverName,
                    // `generated:now()` on PaymentAbandoned.
                    abandonedAt: new Date().toISOString(),
                },
                metadata: {
                    correlation_id: correlationId,
                    causation_id: orderNumber,
                },
            };

            const result = await handleAbandonPayment(tableNumber, command);

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
        case 'already_abandoned':
            return 'Card payment for this order was already abandoned.';
        case 'payment_not_declined':
            return 'The pending payment has not been declined — wait for the provider\'s answer before abandoning.';
        case 'missing_abandon_reason':
            return 'abandonReason must not be empty.';
        default:
            return null;
    }
};
