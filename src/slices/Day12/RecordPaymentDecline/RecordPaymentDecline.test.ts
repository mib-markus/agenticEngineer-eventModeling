import {DeciderSpecification} from '@event-driven-io/emmett';
import assert from 'assert';
import {describe, it} from 'node:test';
import {
    RecordPaymentDeclineCommand,
    RecordPaymentDeclineInitialState,
    decide,
    evolve,
    streamNameFor,
} from './RecordPaymentDeclineCommand';
import {streamNameFor as payOrderStreamNameFor} from '../PayOrder/PayOrderCommand';
import {streamNameFor as openOrderStreamNameFor} from '../OpenOrder/OpenOrderCommand';

describe('RecordPaymentDecline Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: RecordPaymentDeclineInitialState,
    });

    const command = (
        paymentId: string,
        orderNumber: string,
        declineCode: string,
        declinedAt: string,
        tableNumber = '12',
    ): RecordPaymentDeclineCommand => ({
        type: 'RecordPaymentDecline',
        data: {
            paymentId,
            orderNumber,
            tableNumber,
            declineReason: 'Insufficient funds',
            declineCode,
            declinedAt,
        },
        metadata: {},
    });

    // The specs' `given` beat fab5e2ed is the linked copy of PaymentRequested from the
    // happy-path chapter.
    const requested = (paymentId: string, orderNumber: string) => ({
        type: 'PaymentRequested' as const,
        data: {
            paymentId,
            orderNumber,
            tableNumber: '12',
            subtotal: '41.50',
            serviceCharge: '4.15',
            taxAmount: '3.32',
            tipAmount: '5.00',
            totalAmount: '53.97',
            paymentType: 'CARD',
            requestedAt: '2026-04-15T20:15:00Z',
        },
        metadata: {},
    });

    const declined = (paymentId: string, orderNumber: string, declineCode: string) => ({
        type: 'PaymentDeclined' as const,
        data: {
            paymentId,
            orderNumber,
            tableNumber: '12',
            declineReason: 'Insufficient funds',
            declineCode,
            declinedAt: '2026-04-15T20:15:04Z',
        },
        metadata: {},
    });

    it('spec: A declined authorization is recorded against the order', () => {
        given([
            requested('p-6001', 'O-6001'),
        ])
            .when(command('p-6001', 'O-6001', '51', '2026-04-15T20:15:04Z'))
            .then([{
                type: 'PaymentDeclined',
                data: {
                    paymentId: 'p-6001',
                    orderNumber: 'O-6001',
                    tableNumber: '12',
                    declineReason: 'Insufficient funds',
                    declineCode: '51',
                    declinedAt: '2026-04-15T20:15:04Z',
                },
                metadata: {},
            }]);
    });

    // A retry issues a *new* paymentId against the same order, so the earlier
    // PaymentDeclined in the given must not block it - the guards are keyed on paymentId,
    // not orderNumber.
    it('spec: A second decline on a retried payment is recorded too', () => {
        given([
            requested('p-6002', 'O-6002'),
            declined('p-6002', 'O-6002', '51'),
            requested('p-6002-retry', 'O-6002'),
        ])
            .when(command('p-6002-retry', 'O-6002', '05', '2026-04-15T20:20:04Z'))
            .then([{
                type: 'PaymentDeclined',
                data: {
                    paymentId: 'p-6002-retry',
                    orderNumber: 'O-6002',
                    tableNumber: '12',
                    declineReason: 'Insufficient funds',
                    declineCode: '05',
                    declinedAt: '2026-04-15T20:20:04Z',
                },
                metadata: {},
            }]);
    });

    it('spec: Recording the same decline twice is rejected', () => {
        given([
            requested('p-6003', 'O-6003'),
            declined('p-6003', 'O-6003', '51'),
        ])
            .when(command('p-6003', 'O-6003', '51', '2026-04-15T20:15:04Z'))
            .thenThrows((error: any) => error.code === 'decline_already_recorded');
    });

    it('spec: A decline for an unrequested payment is rejected', () => {
        given([])
            .when(command('p-6004', 'O-6004', '51', '2026-04-15T20:15:04Z'))
            .thenThrows((error: any) => error.code === 'payment_not_requested');
    });

    // The read/write split of this automation: the processor reads the payment-keyed
    // DeclinesToRecord read model, but PaymentDeclined must land on the order's own table
    // stream so every existing Day12/Day13 consumer sees it. Asserted here rather than left
    // to review.
    it('writes to the same table stream PayOrder and OpenOrder use', () => {
        assert.strictEqual(streamNameFor('12'), payOrderStreamNameFor('12'));
        assert.strictEqual(streamNameFor('12'), openOrderStreamNameFor('12'));
        assert.strictEqual(streamNameFor('12'), 'Day12-table-12');
    });
});
