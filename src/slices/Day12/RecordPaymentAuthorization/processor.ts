import {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import cron, {ScheduledTask} from 'node-cron';
import {getKnexInstance} from '../../../common/db';
import {storeDlqMessage} from '../../../common/processorDlq';
import {
    AuthorizationsToRecordReadModel,
    tableName as authorizationsToRecordTable,
} from '../AuthorizationsToRecord/AuthorizationsToRecordProjection';
import {
    RecordPaymentAuthorizationCommand,
    handleRecordPaymentAuthorization,
    streamNameFor,
} from './RecordPaymentAuthorizationCommand';

const PROCESSOR_ID = 'recordpaymentauthorization-automation';

// "Authorization Recorder": a processor with `fields: []`, no triggerEvent, and exactly one
// INBOUND READMODEL dependency (AuthorizationsToRecord) is a polling automation - the same
// shape as RouteOrderLineToStation draining OrderLinesToRoute.
const SCHEDULE = '* * * * *';

// AuthorizationsToRecord deliberately keeps a recorded authorization on the list (its own
// "A recorded authorization stays on the list" spec), so every tick after the first sees the
// same row again and decide() rejects it as already recorded. That is the expected steady
// state of this drain, not a processing failure.
const isExpectedRejection = (code: string | undefined): boolean =>
    code === 'already_recorded' || code === 'payment_not_requested';

export const recordAuthorization = async (row: AuthorizationsToRecordReadModel): Promise<void> => {
    const command: RecordPaymentAuthorizationCommand = {
        type: 'RecordPaymentAuthorization',
        data: {
            paymentId: row.paymentId,
            orderNumber: row.orderNumber,
            tableNumber: row.tableNumber,
            amountPaid: row.totalAmount,
            tipAmount: row.tipAmount,
            paymentMethod: row.paymentType,
            authorizationCode: row.authorizationCode,
            paidAt: row.approvedAt,
        },
        metadata: {
            correlation_id: row.paymentId,
            causation_id: row.paymentId,
        },
    };

    try {
        // The row was read out of a payment-keyed read model, but the command is appended
        // to the order's own table stream - row.tableNumber comes from the read model's
        // PaymentRequested half exactly for this.
        await handleRecordPaymentAuthorization(row.tableNumber, command);
    } catch (err: any) {
        if (isExpectedRejection(err?.code)) return;

        console.error(`${PROCESSOR_ID}: failed to record authorization ${row.paymentId}`, err);
        await storeDlqMessage(
            PROCESSOR_ID,
            {
                type: 'RecordPaymentAuthorization',
                data: row,
                metadata: {streamName: streamNameFor(row.tableNumber)},
            } as any,
            err,
        );
    }
};

export const drainAuthorizationsToRecord = async (): Promise<void> => {
    const db = getKnexInstance();

    const rows: AuthorizationsToRecordReadModel[] = await db(authorizationsToRecordTable)
        .withSchema('public')
        .select(
            'payment_id as paymentId',
            'order_number as orderNumber',
            'table_number as tableNumber',
            'total_amount as totalAmount',
            'tip_amount as tipAmount',
            'payment_type as paymentType',
            'authorization_code as authorizationCode',
            'card_brand as cardBrand',
            'masked_card_number as maskedCardNumber',
            'approved_at as approvedAt',
        )
        .orderBy('approved_at');

    for (const row of rows) {
        await recordAuthorization(row);
    }
};

let _task: ScheduledTask | null = null;

export const processor = {
    start: async (_eventStore: PostgresEventStore) => {
        _task = cron.schedule(SCHEDULE, () => {
            drainAuthorizationsToRecord().catch(err =>
                console.error(`${PROCESSOR_ID} tick failed:`, err),
            );
        });
    },

    stop: async () => {
        await _task?.stop();
        _task = null;
    },
};
