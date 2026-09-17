import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {NoShowsDueReadModel, tableName} from './NoShowsDueProjection';

const STAMP_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})$/;

// `now` arrives as the board's DD.MM.YYYY HH:MM, which does not compare as text — it is
// rewritten into the sortable form the table stores alongside grace_ends_at.
export const toSortable = (stamp: string): string | null => {
    const match = STAMP_PATTERN.exec(stamp);
    if (!match) return null;
    return `${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}`;
};

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/query/day7-noshowsdue-collection:
     *   get:
     *     tags: [Day7]
     *     summary: NoShowsDue
     *     description: >
     *       Confirmed reservations whose 15 minute grace period has expired, so the table
     *       can be released as a no-show. There is no clock event in the model: a row
     *       becomes due once the caller's `now` passes its graceEndsAt. A reservation that
     *       has already been released, or that was cancelled, is not listed.
     *     parameters:
     *       - in: query
     *         name: now
     *         required: true
     *         schema:
     *           type: string
     *           example: 15.04.2026 19:16
     *         description: The moment to evaluate the grace periods against
     *     responses:
     *       '200':
     *         description: The NoShowsDue read model
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items:
     *                 $ref: '#/components/schemas/NoShowsDueReadModel'
     *       '400':
     *         description: now is missing or not formatted as DD.MM.YYYY HH:MM
     *       '500':
     *         description: Server error
     * components:
     *   schemas:
     *     NoShowsDueReadModel:
     *       type: object
     *       properties:
     *         reservationCode:
     *           type: string
     *           example: R-7K2Q
     *         eMail:
     *           type: string
     *           example: max.mustermann@gmx.de
     *         date:
     *           type: string
     *           example: 15.04.2026
     *         startTime:
     *           type: string
     *           example: '19:00'
     *         tableNumber:
     *           type: string
     *           example: '12'
     *         graceEndsAt:
     *           type: string
     *           example: 15.04.2026 19:15
     */
    router.get('/api/query/day7-noshowsdue-collection', async (req: Request, res: Response) => {
        try {
            const now = req.query.now?.toString();
            const sortableNow = now ? toSortable(now) : null;
            if (!sortableNow) {
                return res.status(400).json({error: 'now is required, formatted as DD.MM.YYYY HH:MM'});
            }

            const db = getKnexInstance();

            const rows: NoShowsDueReadModel[] = await db(tableName)
                .withSchema('public')
                .select(
                    'reservation_code as reservationCode',
                    'e_mail as eMail',
                    'date',
                    'start_time as startTime',
                    'table_number as tableNumber',
                    'grace_ends_at as graceEndsAt',
                )
                // Strictly greater: at 19:15 exactly the grace period has not yet run out.
                .where('grace_ends_at_sortable', '<', sortableNow)
                .orderBy('grace_ends_at_sortable');

            return res.status(200).json(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ok: false, error: 'Server error'});
        }
    });
};
