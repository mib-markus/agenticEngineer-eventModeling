import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {MarkItemReadyCommand, handleMarkItemReady} from './MarkItemReadyCommand';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/day12/markitemready/{tableNumber}:
     *   post:
     *     tags: [Day12]
     *     summary: Mark Item Ready
     *     description: >
     *       Kitchen or bar staff mark a line in preparation as ready from the
     *       StationDisplay screen. A line that was never started cannot be marked ready,
     *       and a line already ready cannot be marked ready again.
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
     *             required: [orderNumber, lineNumber, station]
     *             properties:
     *               orderNumber:
     *                 type: string
     *                 example: O-1042
     *               lineNumber:
     *                 type: integer
     *                 format: int32
     *                 example: 1
     *               station:
     *                 type: string
     *                 example: kitchen
     *     responses:
     *       '201':
     *         description: Accepted — ItemMarkedReady appended
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
     *           line_not_started — preparation of this line has not started;
     *           already_ready — this line is already marked ready
     *       '500':
     *         description: Server error
     */
    router.post('/api/day12/markitemready/:tableNumber', async (req: Request, res: Response) => {
        const tableNumber = req.params.tableNumber;
        const orderNumber = req.body?.orderNumber;
        const correlationId = req.header('correlation_id') ?? orderNumber;

        try {
            const command: MarkItemReadyCommand = {
                type: 'MarkItemReady',
                data: {
                    orderNumber,
                    tableNumber,
                    lineNumber: req.body?.lineNumber,
                    station: req.body?.station,
                },
                metadata: {
                    readyAt: new Date().toISOString(),
                    correlation_id: correlationId,
                    causation_id: orderNumber,
                },
            };

            const result = await handleMarkItemReady(tableNumber, command);

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
        case 'line_not_started':
            return 'Preparation of this line has not started.';
        case 'already_ready':
            return 'This line is already marked ready.';
        default:
            return null;
    }
};
