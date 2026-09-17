import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {getKnexInstance} from '../../../common/db';
import {NoShowNotificationsToSendReadModel, tableName} from './NoShowNotificationsToSendProjection';

export const api = (): WebApiSetup => (router: Router): void => {

    /**
     * @openapi
     * /api/query/day7-noshownotificationstosend-collection:
     *   get:
     *     tags: [Day7]
     *     summary: NoShowNotificationsToSend
     *     description: >
     *       Guests who still need to be told their table was released as a no-show. A row
     *       is queued when the release happens and leaves the queue once the notice has
     *       been sent.
     *     responses:
     *       '200':
     *         description: The NoShowNotificationsToSend read model
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items:
     *                 $ref: '#/components/schemas/NoShowNotificationsToSendReadModel'
     *       '500':
     *         description: Server error
     * components:
     *   schemas:
     *     NoShowNotificationsToSendReadModel:
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
     */
    router.get('/api/query/day7-noshownotificationstosend-collection', async (_req: Request, res: Response) => {
        try {
            const db = getKnexInstance();

            const rows: NoShowNotificationsToSendReadModel[] = await db(tableName)
                .withSchema('public')
                .select(
                    'reservation_code as reservationCode',
                    'e_mail as eMail',
                    'date',
                    'start_time as startTime',
                )
                .orderBy(['date', 'start_time']);

            return res.status(200).json(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ok: false, error: 'Server error'});
        }
    });
};
