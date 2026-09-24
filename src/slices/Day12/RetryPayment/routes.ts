import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {randomUUID} from 'crypto';
import {RetryPaymentCommand, handleRetryPayment} from './RetryPaymentCommand';

// `fixed:CARD` — a retry is always another card attempt, so this is never taken from the
// request body.
const PAYMENT_METHOD = 'CARD';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/day12/retrypayment/{tableNumber}:
     *   post:
     *     tags: [Day12]
     *     summary: Retry Payment
     *     description: >
     *       The server, looking at the PaymentDeclinedScreen, runs the card again. paymentId
     *       (derived:uuid()) is generated server-side — a retry is a fresh payment, and the
     *       declined one is named as previousPaymentId. paymentMethod is fixed:CARD.
     *       subtotal, serviceCharge and taxAmount are not accepted either: the same bill is
     *       re-sent, so they are read back off the declined PaymentRequested.
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
     *             required: [orderNumber, totalAmount, tipAmount, previousPaymentId]
     *             properties:
     *               orderNumber:
     *                 type: string
     *               totalAmount:
     *                 type: number
     *               tipAmount:
     *                 type: number
     *               previousPaymentId:
     *                 type: string
     *                 format: uuid
     *     responses:
     *       '201':
     *         description: Accepted — PaymentRequested appended under a fresh paymentId
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 ok:
     *                   type: boolean
     *                 payment_id:
     *                   type: string
     *                   format: uuid
     *                 next_expected_stream_version:
     *                   type: string
     *                 last_event_global_position:
     *                   type: string
     *       '409':
     *         description: >
     *           nothing_requested — no payment was requested for this table;
     *           payment_not_declined — the pending payment has not been declined yet;
     *           payment_abandoned — card payment for this order was abandoned
     *       '500':
     *         description: Server error
     */
    router.post('/api/day12/retrypayment/:tableNumber', async (req: Request, res: Response) => {
        const tableNumber = req.params.tableNumber;
        const orderNumber = req.body?.orderNumber;
        const correlationId = req.header('correlation_id') ?? orderNumber;

        // `derived:uuid()` — the retry gets its own paymentId, never the caller's.
        const paymentId = randomUUID();

        try {
            const command: RetryPaymentCommand = {
                type: 'RetryPayment',
                data: {
                    tableNumber,
                    orderNumber,
                    paymentId,
                    totalAmount: req.body?.totalAmount,
                    tipAmount: req.body?.tipAmount,
                    paymentMethod: PAYMENT_METHOD,
                    previousPaymentId: req.body?.previousPaymentId,
                    requestedAt: new Date().toISOString(),
                },
                metadata: {
                    correlation_id: correlationId,
                    causation_id: orderNumber,
                },
            };

            const result = await handleRetryPayment(tableNumber, command);

            res.set('correlation_id', correlationId);
            res.set('causation_id', orderNumber);

            return res.status(201).json({
                ok: true,
                payment_id: paymentId,
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
        case 'nothing_requested':
            return 'No payment was requested for this table — there is nothing to retry.';
        case 'payment_not_declined':
            return 'The pending payment has not been declined — wait for the provider\'s answer before retrying.';
        case 'payment_abandoned':
            return 'Card payment for this order was abandoned — it cannot be retried.';
        default:
            return null;
    }
};
