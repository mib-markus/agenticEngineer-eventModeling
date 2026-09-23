import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {ServeItemCommand, handleServeItem} from './ServeItemCommand';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/day12/serveitem/{tableNumber}:
     *   post:
     *     tags: [Day12]
     *     summary: Serve Item
     *     description: >
     *       A server serves a ready item from the ReadyItemsBoard screen. An item that is
     *       not ready cannot be served, and an already served item cannot be served again.
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
     *             required: [orderNumber, lineNumber, serverName]
     *             properties:
     *               orderNumber:
     *                 type: string
     *                 example: O-1042
     *               lineNumber:
     *                 type: integer
     *                 format: int32
     *                 example: 1
     *               serverName:
     *                 type: string
     *                 example: Anna
     *     responses:
     *       '201':
     *         description: Accepted — ItemServed appended
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
     *           item_not_ready — this item has not been marked ready by its station yet;
     *           already_served — this item has already been served
     *       '500':
     *         description: Server error
     */
    router.post('/api/day12/serveitem/:tableNumber', async (req: Request, res: Response) => {
        const tableNumber = req.params.tableNumber;
        const orderNumber = req.body?.orderNumber;
        const correlationId = req.header('correlation_id') ?? orderNumber;

        try {
            const command: ServeItemCommand = {
                type: 'ServeItem',
                data: {
                    orderNumber,
                    tableNumber,
                    lineNumber: req.body?.lineNumber,
                    serverName: req.body?.serverName,
                },
                metadata: {
                    servedAt: new Date().toISOString(),
                    correlation_id: correlationId,
                    causation_id: orderNumber,
                },
            };

            const result = await handleServeItem(tableNumber, command);

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
        case 'item_not_ready':
            return 'This item has not been marked ready by its station yet.';
        case 'already_served':
            return 'This item has already been served.';
        default:
            return null;
    }
};
