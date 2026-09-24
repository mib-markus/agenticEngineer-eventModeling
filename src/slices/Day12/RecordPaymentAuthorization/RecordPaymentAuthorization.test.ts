import {DeciderSpecification} from '@event-driven-io/emmett';
import assert from 'assert';
import {describe, it} from 'node:test';
import {
    RecordPaymentAuthorizationCommand,
    RecordPaymentAuthorizationInitialState,
    decide,
    evolve,
    streamNameFor,
} from './RecordPaymentAuthorizationCommand';
import {streamNameFor as payOrderStreamNameFor} from '../PayOrder/PayOrderCommand';
import {streamNameFor as openOrderStreamNameFor} from '../OpenOrder/OpenOrderCommand';

describe('RecordPaymentAuthorization Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: RecordPaymentAuthorizationInitialState,
    });

    const command = (
        paymentId: string,
        orderNumber: string,
        amountPaid: string,
        tipAmount: string,
        tableNumber = '12',
    ): RecordPaymentAuthorizationCommand => ({
        type: 'RecordPaymentAuthorization',
        data: {
            paymentId,
            orderNumber,
            tableNumber,
            amountPaid,
            tipAmount,
            paymentMethod: 'CARD',
            authorizationCode: 'A-99213',
            paidAt: '2026-04-15T20:15:04Z',
        },
        metadata: {},
    });

    const requested = (paymentId: string, orderNumber: string, totalAmount: string) => ({
        type: 'PaymentRequested' as const,
        data: {
            paymentId,
            orderNumber,
            tableNumber: '12',
            subtotal: '41.50',
            serviceCharge: '4.15',
            taxAmount: '3.32',
            tipAmount: '5.00',
            totalAmount,
            paymentType: 'CARD',
            requestedAt: '2026-04-15T20:15:00Z',
        },
        metadata: {},
    });

    const paid = (orderNumber: string, paymentId: string, amountPaid: string) => ({
        type: 'OrderPaid' as const,
        data: {
            orderNumber,
            tableNumber: '12',
            amountPaid,
            paymentMethod: 'CARD',
            paidAt: '2026-04-15T20:15:04Z',
            paymentId,
            tipAmount: '5.00',
        },
        metadata: {},
    });

    it('spec: An approved authorization marks the order paid', () => {
        given([
            requested('p-4001', 'O-4001', '53.97'),
        ])
            .when(command('p-4001', 'O-4001', '53.97', '5.00'))
            .then([{
                type: 'OrderPaid',
                data: {
                    orderNumber: 'O-4001',
                    tableNumber: '12',
                    amountPaid: '53.97',
                    paymentMethod: 'CARD',
                    paidAt: '2026-04-15T20:15:04Z',
                    paymentId: 'p-4001',
                    tipAmount: '5.00',
                },
                metadata: {},
            }]);
    });

    it('spec: Recording the same authorization twice is rejected', () => {
        given([
            requested('p-4002', 'O-4002', '53.97'),
            paid('O-4002', 'p-4002', '53.97'),
        ])
            .when(command('p-4002', 'O-4002', '53.97', '5.00'))
            .thenThrows((error: any) => error.code === 'already_recorded');
    });

    it('spec: An authorization for an unrequested payment is rejected', () => {
        given([])
            .when(command('p-4003', 'O-4003', '53.97', '5.00'))
            .thenThrows((error: any) => error.code === 'payment_not_requested');
    });

    // The read/write split of this automation: the processor reads a payment-keyed read
    // model, but OrderPaid must land on the order's own table stream so every existing
    // Day12/Day13 consumer sees it. Asserted here rather than left to review.
    it('writes to the same table stream PayOrder and OpenOrder use', () => {
        assert.strictEqual(streamNameFor('12'), payOrderStreamNameFor('12'));
        assert.strictEqual(streamNameFor('12'), openOrderStreamNameFor('12'));
        assert.strictEqual(streamNameFor('12'), 'Day12-table-12');
    });
});
