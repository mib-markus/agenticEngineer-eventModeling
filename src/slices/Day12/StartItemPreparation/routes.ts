import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {StartItemPreparationCommand, handleStartItemPreparation} from './StartItemPreparationCommand';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/day12/startitempreparation/{tableNumber}:
     *   post:
     *     tags: [Day12]
     *     summary: Start Item Preparation
     *     description: >
     *       Kitchen or bar staff start preparing a routed line from the StationDisplay
     *       screen. A line that was never routed to this station cannot be started, and a
     *       line already in preparation cannot be started again.
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
     *         description: Accepted — ItemPreparationStarted appended
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
     *           line_not_routed — the line was never routed to this station;
     *           already_started — preparation of this line has already started
     *       '500':
     *         description: Server error
     */
    router.post('/api/day12/startitempreparation/:tableNumber', async (req: Request, res: Response) => {
        const tableNumber = req.params.tableNumber;
        const orderNumber = req.body?.orderNumber;
        const correlationId = req.header('correlation_id') ?? orderNumber;

        try {
            const command: StartItemPreparationCommand = {
                type: 'StartItemPreparation',
                data: {
                    orderNumber,
                    tableNumber,
                    lineNumber: req.body?.lineNumber,
                    station: req.body?.station,
                },
                metadata: {
                    startedAt: new Date().toISOString(),
                    correlation_id: correlationId,
                    causation_id: orderNumber,
                },
            };

            const result = await handleStartItemPreparation(tableNumber, command);

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
        case 'line_not_routed':
            return 'This line was never routed to this station.';
        case 'already_started':
            return 'Preparation of this line has already started.';
        default:
            return null;
    }
};
