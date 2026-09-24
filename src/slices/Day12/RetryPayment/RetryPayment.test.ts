import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    RetryPaymentCommand,
    RetryPaymentInitialState,
    decide,
    evolve,
} from './RetryPaymentCommand';

describe('RetryPayment Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: RetryPaymentInitialState,
    });

    const command = (
        paymentId: string,
        previousPaymentId: string,
        orderNumber: string,
        requestedAt: string,
    ): RetryPaymentCommand => ({
        type: 'RetryPayment',
        data: {
            tableNumber: '12',
            orderNumber,
            paymentId,
            totalAmount: '53.97',
            tipAmount: '5.00',
            paymentMethod: 'CARD',
            previousPaymentId,
            requestedAt,
        },
        metadata: {},
    });

    // The specs' first `given` beat (node fab5e2ed) is the linked copy of PaymentRequested
    // from the happy-path chapter; 44de61f8 is PaymentDeclined and f92465ae is
    // PaymentAbandoned.
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

    const declined = (paymentId: string, orderNumber: string, declinedAt: string) => ({
        type: 'PaymentDeclined' as const,
        data: {
            paymentId,
            orderNumber,
            tableNumber: '12',
            declineReason: 'Insufficient funds',
            declineCode: '51',
            declinedAt,
        },
        metadata: {},
    });

    const abandoned = (paymentId: string, orderNumber: string) => ({
        type: 'PaymentAbandoned' as const,
        data: {
            tableNumber: '12',
            orderNumber,
            paymentId,
            abandonReason: 'Guest will pay cash',
            serverName: 'Mara',
            abandonedAt: '2026-04-15T20:25:00Z',
        },
        metadata: {},
    });

    // subtotal, serviceCharge and taxAmount are not command fields - they come back off the
    // declined PaymentRequested, which is what this assertion pins down.
    it('spec: A declined payment can be retried', () => {
        given([
            requested('p-8001', 'O-8001'),
            declined('p-8001', 'O-8001', '2026-04-15T20:15:04Z'),
        ])
            .when(command('p-8001-retry', 'p-8001', 'O-8001', '2026-04-15T20:16:00Z'))
            .then([{
                type: 'PaymentRequested',
                data: {
                    paymentId: 'p-8001-retry',
                    orderNumber: 'O-8001',
                    tableNumber: '12',
                    subtotal: '41.50',
                    serviceCharge: '4.15',
                    taxAmount: '3.32',
                    tipAmount: '5.00',
                    totalAmount: '53.97',
                    paymentType: 'CARD',
                    requestedAt: '2026-04-15T20:16:00Z',
                },
                metadata: {},
            }]);
    });

    it('spec: A retry after two declines is still allowed', () => {
        given([
            requested('p-8002', 'O-8002'),
            declined('p-8002', 'O-8002', '2026-04-15T20:15:04Z'),
            requested('p-8002-b', 'O-8002'),
            declined('p-8002-b', 'O-8002', '2026-04-15T20:18:04Z'),
        ])
            .when(command('p-8002-c', 'p-8002-b', 'O-8002', '2026-04-15T20:19:00Z'))
            .then([{
                type: 'PaymentRequested',
                data: {
                    paymentId: 'p-8002-c',
                    orderNumber: 'O-8002',
                    tableNumber: '12',
                    subtotal: '41.50',
                    serviceCharge: '4.15',
                    taxAmount: '3.32',
                    tipAmount: '5.00',
                    totalAmount: '53.97',
                    paymentType: 'CARD',
                    requestedAt: '2026-04-15T20:19:00Z',
                },
                metadata: {},
            }]);
    });

    it('spec: Retry is rejected when the last payment was not declined', () => {
        given([
            requested('p-8003', 'O-8003'),
        ])
            .when(command('p-8003-retry', 'p-8003', 'O-8003', '2026-04-15T20:16:00Z'))
            .thenThrows((error: any) => error.code === 'payment_not_declined');
    });

    it('spec: Retry is rejected after the payment was abandoned', () => {
        given([
            requested('p-8004', 'O-8004'),
            declined('p-8004', 'O-8004', '2026-04-15T20:15:04Z'),
            abandoned('p-8004', 'O-8004'),
        ])
            .when(command('p-8004-retry', 'p-8004', 'O-8004', '2026-04-15T20:26:00Z'))
            .thenThrows((error: any) => error.code === 'payment_abandoned');
    });

    it('spec: Retry is rejected when nothing was ever requested', () => {
        given([])
            .when(command('p-8005-retry', 'p-8005', 'O-8005', '2026-04-15T20:16:00Z'))
            .thenThrows((error: any) => error.code === 'nothing_requested');
    });
});
