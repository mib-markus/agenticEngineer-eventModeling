import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {randomInt} from 'node:crypto';
import {OpenOrderCommand, handleOpenOrder} from './OpenOrderCommand';

const generateOrderNumber = (): string => `O-${randomInt(1000, 10000)}`;

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/day12/openorder/{tableNumber}:
     *   post:
     *     tags: [Day12]
     *     summary: Open Order
     *     description: >
     *       A waiter opens a fresh order pad for a seated table. A walk-in table with no
     *       reservation can still be served. A second pad cannot be opened while the table
     *       still has an open, not yet submitted order — a waiter carries one pad per table.
     *       Once the first round went to the kitchen a new pad may be opened.
     *     parameters:
     *       - in: path
     *         name: tableNumber
     *         required: true
     *         schema:
     *           type: string
     *           example: '12'
     *         description: The table the order pad is opened for
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
     *             required: [serverName]
     *             properties:
     *               serverName:
     *                 type: string
     *                 example: Anna
     *     responses:
     *       '201':
     *         description: Accepted — OrderOpened appended
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 ok:
     *                   type: boolean
     *                 orderNumber:
     *                   type: string
     *                 next_expected_stream_version:
     *                   type: string
     *                 last_event_global_position:
     *                   type: string
     *       '409':
     *         description: >
     *           table_already_has_open_order — an open, not yet submitted order already
     *           exists for this table
     *       '500':
     *         description: Server error
     */
    router.post('/api/day12/openorder/:tableNumber', async (req: Request, res: Response) => {
        const tableNumber = req.params.tableNumber;
        const correlationId = req.header('correlation_id') ?? tableNumber;
        const orderNumber = generateOrderNumber();

        try {
            const command: OpenOrderCommand = {
                type: 'OpenOrder',
                data: {
                    orderNumber,
                    tableNumber,
                    serverName: req.body?.serverName,
                    openedAt: new Date().toISOString(),
                },
                metadata: {
                    correlation_id: correlationId,
                    causation_id: tableNumber,
                },
            };

            const result = await handleOpenOrder(tableNumber, command);

            res.set('correlation_id', correlationId);
            res.set('causation_id', tableNumber);

            return res.status(201).json({
                ok: true,
                orderNumber,
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
        case 'table_already_has_open_order':
            return 'An open, not yet submitted order already exists for that table.';
        default:
            return null;
    }
};
