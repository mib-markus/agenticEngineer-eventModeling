import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {RemindersDueReadModel, tableName} from './RemindersDueProjection';

const STAMP_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})$/;

// `now` arrives as the board's DD.MM.YYYY HH:MM, which does not compare as text — it is
// rewritten into the sortable form the table stores alongside remind_at.
export const toSortable = (stamp: string): string | null => {
    const match = STAMP_PATTERN.exec(stamp);
    if (!match) return null;
    return `${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}`;
};

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/query/day7-remindersdue-collection:
     *   get:
     *     tags: [Day7]
     *     summary: RemindersDue
     *     description: >
     *       Confirmed reservations whose reminder window has opened — 120 minutes before the
     *       booked time — so the guest can be reminded. There is no clock event in the model:
     *       a row becomes due once the caller's `now` passes its remindAt. A reservation that
     *       has already been reminded, or that was cancelled, is not listed.
     *     parameters:
     *       - in: query
     *         name: now
     *         required: true
     *         schema:
     *           type: string
     *           example: 15.04.2026 17:01
     *         description: The moment to evaluate the reminder windows against
     *     responses:
     *       '200':
     *         description: The RemindersDue read model
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items:
     *                 $ref: '#/components/schemas/RemindersDueReadModel'
     *       '400':
     *         description: now is missing or not formatted as DD.MM.YYYY HH:MM
     *       '500':
     *         description: Server error
     * components:
     *   schemas:
     *     RemindersDueReadModel:
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
     *         remindAt:
     *           type: string
     *           example: 15.04.2026 17:00
     */
    router.get('/api/query/day7-remindersdue-collection', async (req: Request, res: Response) => {
        try {
            const now = req.query.now?.toString();
            const sortableNow = now ? toSortable(now) : null;
            if (!sortableNow) {
                return res.status(400).json({error: 'now is required, formatted as DD.MM.YYYY HH:MM'});
            }

            const db = getKnexInstance();

            const rows: RemindersDueReadModel[] = await db(tableName)
                .withSchema('public')
                .select(
                    'reservation_code as reservationCode',
                    'e_mail as eMail',
                    'date',
                    'start_time as startTime',
                    'table_number as tableNumber',
                    'remind_at as remindAt',
                )
                // Strictly greater: at 17:00 exactly the window has not opened yet, which is
                // what the board's "not due at 16:59, due at 17:01" pair pins down.
                .where('remind_at_sortable', '<', sortableNow)
                .orderBy('remind_at_sortable');

            return res.status(200).json(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ok: false, error: 'Server error'});
        }
    });
};
