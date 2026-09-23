import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {SubmitOrderToKitchenCommand, handleSubmitOrderToKitchen} from './SubmitOrderToKitchenCommand';
import {findTableNumberByOrderNumber} from '../AddOrderLine/OrderLookupProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/day12/submitordertokitchen/{orderNumber}:
     *   post:
     *     tags: [Day12]
     *     summary: Submit Order To Kitchen
     *     description: >
     *       The waiter hands the pad to the kitchen. An empty pad, or a pad whose every
     *       line was struck off, is not handed to the kitchen. The same pad cannot be
     *       handed in twice, and a pad that was never opened cannot be handed in.
     *     parameters:
     *       - in: path
     *         name: orderNumber
     *         required: true
     *         schema:
     *           type: string
     *           example: O-1042
     *         description: The open order pad being handed to the kitchen
     *       - in: header
     *         name: correlation_id
     *         required: false
     *         schema:
     *           type: string
     *     responses:
     *       '201':
     *         description: Accepted — OrderSubmittedToKitchen appended
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
     *           pad_never_opened — no open order exists for this orderNumber;
     *           pad_already_submitted — the order was already submitted to the kitchen;
     *           pad_is_empty — the order has no lines left for the kitchen to prepare
     *       '500':
     *         description: Server error
     */
    router.post('/api/day12/submitordertokitchen/:orderNumber', async (req: Request, res: Response) => {
        const orderNumber = req.params.orderNumber;
        const correlationId = req.header('correlation_id') ?? orderNumber;

        try {
            const db = getKnexInstance();

            const tableNumber = await findTableNumberByOrderNumber(db, orderNumber);
            if (!tableNumber) {
                return res.status(409).json({error: errorMapping('pad_never_opened')});
            }

            const command: SubmitOrderToKitchenCommand = {
                type: 'SubmitOrderToKitchen',
                data: {
                    orderNumber,
                    submittedAt: new Date().toISOString(),
                },
                metadata: {
                    correlation_id: correlationId,
                    causation_id: orderNumber,
                },
            };

            const result = await handleSubmitOrderToKitchen(tableNumber, command);

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
        case 'pad_never_opened':
            return 'No open order exists for this orderNumber.';
        case 'pad_already_submitted':
            return 'This order was already submitted to the kitchen.';
        case 'pad_is_empty':
            return 'This order has no lines left for the kitchen to prepare.';
        default:
            return null;
    }
};
