import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {randomUUID} from 'crypto';
import {RequestPaymentCommand, handleRequestPayment, totalWithTip} from './RequestPaymentCommand';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/day12/requestpayment/{tableNumber}:
     *   post:
     *     tags: [Day12]
     *     summary: Request Payment
     *     description: >
     *       The server shows the priced bill from the PaymentScreen, enters a tip and
     *       requests a card payment. paymentId (derived:uuid()) and requestedAt
     *       (derived:now()) are generated server-side, and totalAmount is derived as
     *       PaymentSummary.totalAmount + tipAmount, so none of the three is accepted from
     *       the request body.
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
     *             required: [orderNumber, subtotal, serviceCharge, taxAmount, tipAmount, paymentType]
     *             properties:
     *               orderNumber:
     *                 type: string
     *               subtotal:
     *                 type: number
     *               serviceCharge:
     *                 type: number
     *               taxAmount:
     *                 type: number
     *               tipAmount:
     *                 type: number
     *               paymentType:
     *                 type: string
     *     responses:
     *       '201':
     *         description: Accepted — PaymentRequested appended
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
     *           payment_pending — a payment authorization for this order is already pending;
     *           already_paid — the order is already paid;
     *           no_routed_lines — nothing has been ordered on this table;
     *           negative_tip — tipAmount must not be negative
     *       '500':
     *         description: Server error
     */
    router.post('/api/day12/requestpayment/:tableNumber', async (req: Request, res: Response) => {
        const tableNumber = req.params.tableNumber;
        const orderNumber = req.body?.orderNumber;
        const correlationId = req.header('correlation_id') ?? orderNumber;

        // `generated: true` fields: paymentId is `derived:uuid()`, requestedAt is
        // `derived:now()`. Both are stamped here, never taken from the caller.
        const paymentId = randomUUID();
        const requestedAt = new Date().toISOString();

        const subtotal = req.body?.subtotal;
        const serviceCharge = req.body?.serviceCharge;
        const taxAmount = req.body?.taxAmount;
        const tipAmount = req.body?.tipAmount;

        try {
            const command: RequestPaymentCommand = {
                type: 'RequestPayment',
                data: {
                    paymentId,
                    orderNumber,
                    tableNumber,
                    subtotal,
                    serviceCharge,
                    taxAmount,
                    tipAmount,
                    totalAmount: totalWithTip(subtotal, serviceCharge, taxAmount, tipAmount),
                    paymentType: req.body?.paymentType,
                    requestedAt,
                },
                metadata: {
                    correlation_id: correlationId,
                    causation_id: orderNumber,
                },
            };

            const result = await handleRequestPayment(tableNumber, command);

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
        case 'payment_pending':
            return 'A payment authorization for this order is already pending — wait for the provider\'s answer before requesting another.';
        case 'already_paid':
            return 'The order is already paid.';
        case 'no_routed_lines':
            return 'Nothing has been ordered on this table — there is nothing to pay.';
        case 'negative_tip':
            return 'tipAmount must not be negative.';
        default:
            return null;
    }
};
