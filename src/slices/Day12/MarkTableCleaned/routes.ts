import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {MarkTableCleanedCommand, handleMarkTableCleaned} from './MarkTableCleanedCommand';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/day12/marktablecleaned/{tableNumber}:
     *   post:
     *     tags: [Day12]
     *     summary: Mark Table Cleaned
     *     description: >
     *       Staff marks a closed table as cleaned from the TableCleaningScreen, freeing it
     *       for reassignment. A table that was not closed cannot be marked cleaned, and an
     *       already freed table cannot be marked cleaned again.
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
     *         description: Accepted — TableFreedForReassignment appended
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
     *           table_not_closed — the table has not been closed yet;
     *           already_cleaned — this table has already been marked cleaned
     *       '500':
     *         description: Server error
     */
    router.post('/api/day12/marktablecleaned/:tableNumber', async (req: Request, res: Response) => {
        const tableNumber = req.params.tableNumber;
        const orderNumber = req.body?.orderNumber;
        const correlationId = req.header('correlation_id') ?? orderNumber;

        try {
            const command: MarkTableCleanedCommand = {
                type: 'MarkTableCleaned',
                data: {
                    tableNumber,
                    orderNumber,
                },
                metadata: {
                    cleanedAt: new Date().toISOString(),
                    correlation_id: correlationId,
                    causation_id: orderNumber,
                },
            };

            const result = await handleMarkTableCleaned(tableNumber, command);

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
        case 'table_not_closed':
            return 'The table has not been closed, so it cannot be marked cleaned.';
        case 'already_cleaned':
            return 'This table has already been marked cleaned.';
        default:
            return null;
    }
};
