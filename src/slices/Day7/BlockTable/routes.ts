import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {BlockTableCommand, TableHold, handleBlockTable} from './BlockTableCommand';
import {tableName as tableStatusTable} from '../../Day6/TableStatus/TableStatusProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/day7/blocktable/{tableNumber}:
     *   post:
     *     tags: [Day7]
     *     summary: BlockTable
     *     description: >
     *       Takes a table out of service for part of a service day — maintenance, a private
     *       event, and so on. Blocking is independent of reservations, but only a table with
     *       no active reservation at an overlapping time can be blocked.
     *     parameters:
     *       - in: path
     *         name: tableNumber
     *         required: true
     *         schema:
     *           type: string
     *           example: '12'
     *         description: The table being taken out of service
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
     *             required: [date, startTime, endTime, reason]
     *             properties:
     *               date:
     *                 type: string
     *                 example: 15.04.2026
     *               startTime:
     *                 type: string
     *                 example: '14:00'
     *               endTime:
     *                 type: string
     *                 example: '17:00'
     *               reason:
     *                 type: string
     *                 example: Private event
     *     responses:
     *       '201':
     *         description: Accepted — TableBlocked appended
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
     *           table_held_by_reservation — an active reservation holds the table at an
     *           overlapping time;
     *           table_already_blocked — the table is already blocked at an overlapping time
     *       '500':
     *         description: Server error
     */
    router.post('/api/day7/blocktable/:tableNumber', async (req: Request, res: Response) => {
        const tableNumber = req.params.tableNumber;
        const correlationId = req.header('correlation_id') ?? tableNumber;

        try {
            const db = getKnexInstance();

            // Reservations live on per-guest streams, so the table's own stream cannot see
            // who holds it — the holds come from TableStatus and go in as metadata.
            const tableHolds: TableHold[] = await db(tableStatusTable)
                .withSchema('public')
                .select(
                    'reservation_code as reservationCode',
                    'table_number as tableNumber',
                    'date',
                    'start_time as startTime',
                    'end_time as endTime',
                )
                .where({table_number: tableNumber})
                .whereNotNull('table_number');

            const command: BlockTableCommand = {
                type: 'BlockTable',
                data: {
                    tableNumber,
                    date: req.body?.date,
                    startTime: req.body?.startTime,
                    endTime: req.body?.endTime,
                    reason: req.body?.reason,
                },
                metadata: {
                    tableHolds,
                    correlation_id: correlationId,
                    causation_id: tableNumber,
                },
            };

            const result = await handleBlockTable(tableNumber, command);

            res.set('correlation_id', correlationId);
            res.set('causation_id', tableNumber);

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
        case 'table_held_by_reservation':
            return 'An active reservation holds that table at an overlapping time.';
        case 'table_already_blocked':
            return 'That table is already blocked at an overlapping time.';
        default:
            return null;
    }
};
