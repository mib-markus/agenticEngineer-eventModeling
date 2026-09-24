import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    SubmitAuthorizationDeclineCommand,
    SubmitAuthorizationDeclineInitialState,
    decide,
    evolve,
} from './SubmitAuthorizationDeclineCommand';

describe('SubmitAuthorizationDecline Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: SubmitAuthorizationDeclineInitialState,
    });

    const command = (
        paymentId: string,
        declineReason: string,
        declineCode: string,
        declinedAt: string,
    ): SubmitAuthorizationDeclineCommand => ({
        type: 'SubmitAuthorizationDecline',
        data: {
            paymentId,
            declineReason,
            declineCode,
            cardBrand: 'VISA',
            maskedCardNumber: '**** **** **** 4242',
            declinedAt,
        },
        metadata: {},
    });

    // The specs' `given` beat is the linked copy of PaymentRequested from the happy-path
    // chapter (node fab5e2ed, titled "PaymentRequested (from the happy-path chapter)").
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

    const declined = (paymentId: string, declineCode: string) => ({
        type: 'AuthorizationDeclined' as const,
        data: {
            paymentId,
            declineReason: 'Insufficient funds',
            declineCode,
            cardBrand: 'VISA',
            maskedCardNumber: '**** **** **** 4242',
            declinedAt: '2026-04-15T20:15:04Z',
        },
        metadata: {},
    });

    it("spec: The provider's decline callback is accepted", () => {
        given([
            requested('p-5001', 'O-5001'),
        ])
            .when(command('p-5001', 'Insufficient funds', '51', '2026-04-15T20:15:04Z'))
            .then([{
                type: 'AuthorizationDeclined',
                data: {
                    paymentId: 'p-5001',
                    declineReason: 'Insufficient funds',
                    declineCode: '51',
                    cardBrand: 'VISA',
                    maskedCardNumber: '**** **** **** 4242',
                    declinedAt: '2026-04-15T20:15:04Z',
                },
                metadata: {},
            }]);
    });

    it('spec: A replayed decline callback is rejected', () => {
        given([
            requested('p-5002', 'O-5002'),
            declined('p-5002', '51'),
        ])
            .when(command('p-5002', 'Insufficient funds', '51', '2026-04-15T20:15:04Z'))
            .thenThrows((error: any) => error.code === 'decline_replayed');
    });

    it('spec: A decline callback for an unknown paymentId is rejected', () => {
        given([])
            .when(command('p-5003', 'Insufficient funds', '51', '2026-04-15T20:15:04Z'))
            .thenThrows((error: any) => error.code === 'unknown_payment');
    });
});
