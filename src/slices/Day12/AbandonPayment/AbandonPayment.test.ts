import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    AbandonPaymentCommand,
    AbandonPaymentInitialState,
    decide,
    evolve,
} from './AbandonPaymentCommand';

describe('AbandonPayment Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: AbandonPaymentInitialState,
    });

    const command = (
        paymentId: string,
        orderNumber: string,
        abandonReason: string,
        abandonedAt: string,
    ): AbandonPaymentCommand => ({
        type: 'AbandonPayment',
        data: {
            tableNumber: '12',
            orderNumber,
            paymentId,
            abandonReason,
            serverName: 'Mara',
            abandonedAt,
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

    it('spec: A declined card payment can be abandoned', () => {
        given([
            requested('p-9001', 'O-9001'),
            declined('p-9001', 'O-9001', '2026-04-15T20:15:04Z'),
        ])
            .when(command('p-9001', 'O-9001', 'Guest will pay cash', '2026-04-15T20:25:00Z'))
            .then([{
                type: 'PaymentAbandoned',
                data: {
                    tableNumber: '12',
                    orderNumber: 'O-9001',
                    paymentId: 'p-9001',
                    abandonReason: 'Guest will pay cash',
                    serverName: 'Mara',
                    abandonedAt: '2026-04-15T20:25:00Z',
                },
                metadata: {},
            }]);
    });

    // Each retry is its own paymentId, and the third one is the payment being given up on.
    it('spec: Abandoning after three declines is allowed', () => {
        given([
            requested('p-9002-a', 'O-9002'),
            declined('p-9002-a', 'O-9002', '2026-04-15T20:15:04Z'),
            requested('p-9002-b', 'O-9002'),
            declined('p-9002-b', 'O-9002', '2026-04-15T20:18:04Z'),
            requested('p-9002-c', 'O-9002'),
            declined('p-9002-c', 'O-9002', '2026-04-15T20:21:04Z'),
        ])
            .when(command('p-9002-c', 'O-9002', 'Card keeps failing', '2026-04-15T20:25:00Z'))
            .then([{
                type: 'PaymentAbandoned',
                data: {
                    tableNumber: '12',
                    orderNumber: 'O-9002',
                    paymentId: 'p-9002-c',
                    abandonReason: 'Card keeps failing',
                    serverName: 'Mara',
                    abandonedAt: '2026-04-15T20:25:00Z',
                },
                metadata: {},
            }]);
    });

    it('spec: Abandoning twice is rejected', () => {
        given([
            requested('p-9003', 'O-9003'),
            declined('p-9003', 'O-9003', '2026-04-15T20:15:04Z'),
            abandoned('p-9003', 'O-9003'),
        ])
            .when(command('p-9003', 'O-9003', 'Guest will pay cash', '2026-04-15T20:26:00Z'))
            .thenThrows((error: any) => error.code === 'already_abandoned');
    });

    it('spec: Abandoning is rejected while the provider has not answered', () => {
        given([
            requested('p-9004', 'O-9004'),
        ])
            .when(command('p-9004', 'O-9004', 'Guest will pay cash', '2026-04-15T20:25:00Z'))
            .thenThrows((error: any) => error.code === 'payment_not_declined');
    });

    it('spec: Abandoning requires a reason', () => {
        given([
            requested('p-9005', 'O-9005'),
            declined('p-9005', 'O-9005', '2026-04-15T20:15:04Z'),
        ])
            .when(command('p-9005', 'O-9005', '', '2026-04-15T20:25:00Z'))
            .thenThrows((error: any) => error.code === 'missing_abandon_reason');
    });
});
