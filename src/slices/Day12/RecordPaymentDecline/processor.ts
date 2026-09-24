import {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import cron, {ScheduledTask} from 'node-cron';
import {getKnexInstance} from '../../../common/db';
import {storeDlqMessage} from '../../../common/processorDlq';
import {
    DeclinesToRecordReadModel,
    tableName as declinesToRecordTable,
} from '../DeclinesToRecord/DeclinesToRecordProjection';
import {
    RecordPaymentDeclineCommand,
    handleRecordPaymentDecline,
    streamNameFor,
} from './RecordPaymentDeclineCommand';

const PROCESSOR_ID = 'recordpaymentdecline-automation';

// "Decline Recorder": a processor with `fields: []`, no triggerEvent, and exactly one INBOUND
// READMODEL dependency (DeclinesToRecord) is a polling automation - the same shape as the
// sibling Authorization Recorder draining AuthorizationsToRecord.
const SCHEDULE = '* * * * *';

// DeclinesToRecord deliberately keeps a recorded decline on the list (its own "A recorded
// decline stays on the list" spec), so every tick after the first sees the same row again and
// decide() rejects it as already recorded. That is the expected steady state of this drain,
// not a processing failure.
const isExpectedRejection = (code: string | undefined): boolean =>
    code === 'decline_already_recorded' || code === 'payment_not_requested';

export const recordDecline = async (row: DeclinesToRecordReadModel): Promise<void> => {
    const command: RecordPaymentDeclineCommand = {
        type: 'RecordPaymentDecline',
        data: {
            paymentId: row.paymentId,
            orderNumber: row.orderNumber,
            tableNumber: row.tableNumber,
            declineReason: row.declineReason,
            declineCode: row.declineCode,
            declinedAt: row.declinedAt,
        },
        metadata: {
            correlation_id: row.paymentId,
            causation_id: row.paymentId,
        },
    };

    try {
        // The row was read out of a payment-keyed read model, but the command is appended to
        // the order's own table stream - row.tableNumber comes from the read model's
        // PaymentRequested half exactly for this.
        await handleRecordPaymentDecline(row.tableNumber, command);
    } catch (err: any) {
        if (isExpectedRejection(err?.code)) return;

        console.error(`${PROCESSOR_ID}: failed to record decline ${row.paymentId}`, err);
        await storeDlqMessage(
            PROCESSOR_ID,
            {
                type: 'RecordPaymentDecline',
                data: row,
                metadata: {streamName: streamNameFor(row.tableNumber)},
            } as any,
            err,
        );
    }
};

export const drainDeclinesToRecord = async (): Promise<void> => {
    const db = getKnexInstance();

    const rows: DeclinesToRecordReadModel[] = await db(declinesToRecordTable)
        .withSchema('public')
        .select(
            'payment_id as paymentId',
            'order_number as orderNumber',
            'table_number as tableNumber',
            'total_amount as totalAmount',
            'decline_reason as declineReason',
            'decline_code as declineCode',
            'masked_card_number as maskedCardNumber',
            'declined_at as declinedAt',
        )
        .orderBy('declined_at');

    for (const row of rows) {
        await recordDecline(row);
    }
};

let _task: ScheduledTask | null = null;

export const processor = {
    start: async (_eventStore: PostgresEventStore) => {
        _task = cron.schedule(SCHEDULE, () => {
            drainDeclinesToRecord().catch(err =>
                console.error(`${PROCESSOR_ID} tick failed:`, err),
            );
        });
    },

    stop: async () => {
        await _task?.stop();
        _task = null;
    },
};
