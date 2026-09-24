import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {
    SubmitAuthorizationDeclineCommand,
    handleSubmitAuthorizationDecline,
} from './SubmitAuthorizationDeclineCommand';
// Sibling callback commands on the same stream share one lookup projection - this is the
// same paymentId -> tableNumber mapping SubmitAuthorizationApproval already resolves.
import {findPaymentLocation} from '../SubmitAuthorizationApproval/PaymentLookupProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/day12/submitauthorizationdecline/{paymentId}:
     *   post:
     *     tags: [Day12]
     *     summary: Submit Authorization Decline
     *     description: >
     *       The payment provider's decline callback. Every field is taken from the PSP
     *       webhook payload. The callback carries only the paymentId, so the table stream
     *       it belongs to is resolved through the payment lookup first; a paymentId that is
     *       unknown to the lookup cannot be matched to any requested payment.
     *     parameters:
     *       - in: path
     *         name: paymentId
     *         required: true
     *         schema:
     *           type: string
     *           format: uuid
     *         description: PSP webhook payload.payment_id — the payment this callback answers
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
     *             required: [declineReason, declineCode, cardBrand, maskedCardNumber, declinedAt]
     *             properties:
     *               declineReason:
     *                 type: string
     *               declineCode:
     *                 type: string
     *               cardBrand:
     *                 type: string
     *               maskedCardNumber:
     *                 type: string
     *               declinedAt:
     *                 type: string
     *                 format: date-time
     *     responses:
     *       '201':
     *         description: Accepted — AuthorizationDeclined appended
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
     *           unknown_payment — no payment was requested with this paymentId;
     *           decline_replayed — this paymentId was already declined
     *       '500':
     *         description: Server error
     */
    router.post('/api/day12/submitauthorizationdecline/:paymentId', async (req: Request, res: Response) => {
        const paymentId = req.params.paymentId;
        const correlationId = req.header('correlation_id') ?? paymentId;

        try {
            const db = getKnexInstance();

            const location = await findPaymentLocation(db, paymentId);
            if (!location) {
                return res.status(409).json({error: errorMapping('unknown_payment')});
            }

            const command: SubmitAuthorizationDeclineCommand = {
                type: 'SubmitAuthorizationDecline',
                data: {
                    paymentId,
                    declineReason: req.body?.declineReason,
                    declineCode: req.body?.declineCode,
                    cardBrand: req.body?.cardBrand,
                    maskedCardNumber: req.body?.maskedCardNumber,
                    declinedAt: req.body?.declinedAt,
                },
                metadata: {
                    correlation_id: correlationId,
                    causation_id: paymentId,
                },
            };

            const result = await handleSubmitAuthorizationDecline(location.tableNumber, command);

            res.set('correlation_id', correlationId);
            res.set('causation_id', paymentId);

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
        case 'unknown_payment':
            return 'No payment was requested with this paymentId — the callback cannot be matched.';
        case 'decline_replayed':
            return 'This paymentId was already declined — the provider is retrying a callback it already delivered.';
        default:
            return null;
    }
};
