import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {CloseTableCommand, handleCloseTable} from './CloseTableCommand';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/day12/closetable/{tableNumber}:
     *   post:
     *     tags: [Day12]
     *     summary: Close Table
     *     description: >
     *       Staff closes a table from the TableClosingScreen once its order has been paid.
     *       An unpaid table cannot be closed, and an already closed table cannot be closed
     *       again.
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
     *             required: [orderNumber]
     *             properties:
     *               orderNumber:
     *                 type: string
     *                 example: O-1042
     *     responses:
     *       '201':
     *         description: Accepted — TableClosed appended
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
     *           unpaid_table — the order has not been paid yet;
     *           already_closed — this table has already been closed
     *       '500':
     *         description: Server error
     */
    router.post('/api/day12/closetable/:tableNumber', async (req: Request, res: Response) => {
        const tableNumber = req.params.tableNumber;
        const orderNumber = req.body?.orderNumber;
        const correlationId = req.header('correlation_id') ?? orderNumber;

        try {
            const command: CloseTableCommand = {
                type: 'CloseTable',
                data: {
                    orderNumber,
                    tableNumber,
                },
                metadata: {
                    closedAt: new Date().toISOString(),
                    correlation_id: correlationId,
                    causation_id: orderNumber,
                },
            };

            const result = await handleCloseTable(tableNumber, command);

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
        case 'unpaid_table':
            return 'The order has not been paid, so the table cannot be closed.';
        case 'already_closed':
            return 'This table has already been closed.';
        default:
            return null;
    }
};
