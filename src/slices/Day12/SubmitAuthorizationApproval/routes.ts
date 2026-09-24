import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {
    SubmitAuthorizationApprovalCommand,
    handleSubmitAuthorizationApproval,
} from './SubmitAuthorizationApprovalCommand';
import {findPaymentLocation} from './PaymentLookupProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/day12/submitauthorizationapproval/{paymentId}:
     *   post:
     *     tags: [Day12]
     *     summary: Submit Authorization Approval
     *     description: >
     *       The payment provider's approval callback. Every field is taken from the PSP
     *       webhook payload. The callback carries only the paymentId, so the table stream
     *       it belongs to is resolved through the payment lookup first; a paymentId that
     *       is unknown to the lookup cannot be matched to any requested payment.
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
     *             required: [authorizationCode, cardBrand, maskedCardNumber, approvedAt]
     *             properties:
     *               authorizationCode:
     *                 type: string
     *               cardBrand:
     *                 type: string
     *               maskedCardNumber:
     *                 type: string
     *               approvedAt:
     *                 type: string
     *                 format: date-time
     *     responses:
     *       '201':
     *         description: Accepted — AuthorizationApproved appended
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
     *           authorization_replayed — this paymentId was already authorized
     *       '500':
     *         description: Server error
     */
    router.post('/api/day12/submitauthorizationapproval/:paymentId', async (req: Request, res: Response) => {
        const paymentId = req.params.paymentId;
        const correlationId = req.header('correlation_id') ?? paymentId;

        try {
            const db = getKnexInstance();

            // The command carries no tableNumber, so the target stream comes from the
            // lookup. A miss here means the paymentId itself is unmatched — a distinct
            // failure from decide()'s own guards, which see a real stream.
            const location = await findPaymentLocation(db, paymentId);
            if (!location) {
                return res.status(409).json({error: errorMapping('unknown_payment')});
            }

            const command: SubmitAuthorizationApprovalCommand = {
                type: 'SubmitAuthorizationApproval',
                data: {
                    paymentId,
                    authorizationCode: req.body?.authorizationCode,
                    cardBrand: req.body?.cardBrand,
                    maskedCardNumber: req.body?.maskedCardNumber,
                    approvedAt: req.body?.approvedAt,
                },
                metadata: {
                    correlation_id: correlationId,
                    causation_id: paymentId,
                },
            };

            const result = await handleSubmitAuthorizationApproval(location.tableNumber, command);

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
        case 'authorization_replayed':
            return 'This paymentId was already authorized — the provider is retrying a callback it already delivered.';
        default:
            return null;
    }
};
