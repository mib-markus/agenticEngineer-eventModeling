import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    SubmitAuthorizationApprovalCommand,
    SubmitAuthorizationApprovalInitialState,
    decide,
    evolve,
} from './SubmitAuthorizationApprovalCommand';

describe('SubmitAuthorizationApproval Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: SubmitAuthorizationApprovalInitialState,
    });

    const command = (
        paymentId: string,
        authorizationCode: string,
        cardBrand: string,
        maskedCardNumber: string,
        approvedAt: string,
    ): SubmitAuthorizationApprovalCommand => ({
        type: 'SubmitAuthorizationApproval',
        data: {paymentId, authorizationCode, cardBrand, maskedCardNumber, approvedAt},
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

    const approved = (
        paymentId: string,
        authorizationCode: string,
        authorizedAmount: string,
    ) => ({
        type: 'AuthorizationApproved' as const,
        data: {
            paymentId,
            authorizationCode,
            cardBrand: 'VISA',
            maskedCardNumber: '**** **** **** 4242',
            authorizedAmount,
            approvedAt: '2026-04-15T20:15:04Z',
        },
        metadata: {},
    });

    it("spec: The provider's approval callback is accepted", () => {
        given([
            requested('p-7f3a', 'O-2001', '53.97'),
        ])
            .when(command('p-7f3a', 'A-99213', 'VISA', '**** **** **** 4242', '2026-04-15T20:15:04Z'))
            .then([{
                type: 'AuthorizationApproved',
                data: {
                    paymentId: 'p-7f3a',
                    authorizationCode: 'A-99213',
                    cardBrand: 'VISA',
                    maskedCardNumber: '**** **** **** 4242',
                    // authorizedAmount is not a command field — the provider authorized
                    // the total that was requested, read back off the replayed
                    // PaymentRequested.
                    authorizedAmount: '53.97',
                    approvedAt: '2026-04-15T20:15:04Z',
                },
                metadata: {},
            }]);
    });

    it('spec: A replayed approval callback is rejected', () => {
        given([
            requested('p-8a41', 'O-2002', '48.97'),
            approved('p-8a41', 'A-99214', '48.97'),
        ])
            .when(command('p-8a41', 'A-99214', 'VISA', '**** **** **** 4242', '2026-04-15T20:15:04Z'))
            .thenThrows((error: any) => error.code === 'authorization_replayed');
    });

    it('spec: A callback for an unknown paymentId is rejected', () => {
        given([])
            .when(command('p-9b52', 'A-99215', 'VISA', '**** **** **** 4242', '2026-04-15T20:15:04Z'))
            .thenThrows((error: any) => error.code === 'unknown_payment');
    });
});
