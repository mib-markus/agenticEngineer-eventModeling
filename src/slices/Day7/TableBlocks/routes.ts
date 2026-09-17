import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {TableBlocksReadModel, tableName} from './TableBlocksProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/query/day7-tableblocks-collection:
     *   get:
     *     tags: [Day7]
     *     summary: TableBlocks
     *     description: >
     *       The blocks on a table for a service day, so the host can see which hours the
     *       table is out of service and why. A table can be blocked more than once on the
     *       same day, and a table that was never blocked returns an empty list.
     *     parameters:
     *       - in: query
     *         name: tableNumber
     *         required: false
     *         schema:
     *           type: string
     *           example: '12'
     *         description: Restrict to one table
     *       - in: query
     *         name: date
     *         required: false
     *         schema:
     *           type: string
     *           example: 15.04.2026
     *         description: Restrict to one service day
     *     responses:
     *       '200':
     *         description: The TableBlocks read model
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items:
     *                 $ref: '#/components/schemas/TableBlocksReadModel'
     *       '500':
     *         description: Server error
     * components:
     *   schemas:
     *     TableBlocksReadModel:
     *       type: object
     *       properties:
     *         tableNumber:
     *           type: string
     *           example: '12'
     *         date:
     *           type: string
     *           example: 15.04.2026
     *         startTime:
     *           type: string
     *           example: '14:00'
     *         endTime:
     *           type: string
     *           example: '17:00'
     *         reason:
     *           type: string
     *           example: Private event
     */
    router.get('/api/query/day7-tableblocks-collection', async (req: Request, res: Response) => {
        try {
            const db = getKnexInstance();
            const tableNumber = req.query.tableNumber?.toString();
            const date = req.query.date?.toString();

            const query = db(tableName)
                .withSchema('public')
                .select(
                    'table_number as tableNumber',
                    'date',
                    'start_time as startTime',
                    'end_time as endTime',
                    'reason',
                );

            if (tableNumber) query.where({table_number: tableNumber});
            if (date) query.where({date});

            const rows: TableBlocksReadModel[] = await query.orderBy(['date', 'start_time']);
            return res.status(200).json(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ok: false, error: 'Server error'});
        }
    });
};
