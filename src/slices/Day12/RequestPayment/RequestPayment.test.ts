import {DeciderSpecification} from '@event-driven-io/emmett';
import assert from 'assert';
import {describe, it} from 'node:test';
import {
    RequestPaymentCommand,
    RequestPaymentInitialState,
    decide,
    evolve,
    totalWithTip,
} from './RequestPaymentCommand';

const SUBTOTAL = '41.50';
const SERVICE_CHARGE = '4.15';
const TAX_AMOUNT = '3.32';

const command = (
    paymentId: string,
    orderNumber: string,
    tipAmount: string,
    paymentType: string,
    requestedAt: string,
    tableNumber = '12',
): RequestPaymentCommand => ({
    type: 'RequestPayment',
    data: {
        paymentId,
        orderNumber,
        tableNumber,
        subtotal: SUBTOTAL,
        serviceCharge: SERVICE_CHARGE,
        taxAmount: TAX_AMOUNT,
        tipAmount,
        totalAmount: totalWithTip(SUBTOTAL, SERVICE_CHARGE, TAX_AMOUNT, tipAmount),
        paymentType,
        requestedAt,
    },
    metadata: {},
});

const routed = (orderNumber: string, lineNumber: number, itemNumber: string, quantity: number) => ({
    type: 'OrderLineRoutedToStation' as const,
    data: {
        orderNumber,
        tableNumber: '12',
        lineNumber,
        itemNumber,
        quantity,
        specialWishes: '',
        station: 'kitchen',
        routedAt: '2026-04-15T19:18:05Z',
    },
    metadata: {},
});

const served = (orderNumber: string, lineNumber: number) => ({
    type: 'ItemServed' as const,
    data: {
        orderNumber,
        tableNumber: '12',
        lineNumber,
        serverName: 'Anna',
        servedAt: '2026-04-15T19:36:00Z',
    },
    metadata: {},
});

const requested = (paymentId: string, orderNumber: string, tipAmount: string) => ({
    type: 'PaymentRequested' as const,
    data: {
        paymentId,
        orderNumber,
        tableNumber: '12',
        subtotal: SUBTOTAL,
        serviceCharge: SERVICE_CHARGE,
        taxAmount: TAX_AMOUNT,
        tipAmount,
        totalAmount: totalWithTip(SUBTOTAL, SERVICE_CHARGE, TAX_AMOUNT, tipAmount),
        paymentType: 'CARD',
        requestedAt: '2026-04-15T20:15:00Z',
    },
    metadata: {},
});

const paid = (orderNumber: string, amountPaid: string) => ({
    type: 'OrderPaid' as const,
    data: {
        orderNumber,
        tableNumber: '12',
        amountPaid,
        paymentMethod: 'CARD',
        paidAt: '2026-04-15T20:16:00Z',
    },
    metadata: {},
});

describe('RequestPayment Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: RequestPaymentInitialState,
    });

    it('spec: Card payment requested with a tip', () => {
        given([
            routed('O-2001', 1, 'M-12', 2),
            routed('O-2001', 2, 'D-03', 1),
            served('O-2001', 1),
            served('O-2001', 2),
        ])
            .when(command('p-7f3a', 'O-2001', '5.00', 'CARD', '2026-04-15T20:15:00Z'))
            .then([{
                type: 'PaymentRequested',
                data: {
                    paymentId: 'p-7f3a',
                    orderNumber: 'O-2001',
                    tableNumber: '12',
                    subtotal: SUBTOTAL,
                    serviceCharge: SERVICE_CHARGE,
                    taxAmount: TAX_AMOUNT,
                    tipAmount: '5.00',
                    // 41.50 + 4.15 + 3.32 = 48.97 priced bill, plus the 5.00 tip.
                    totalAmount: '53.97',
                    paymentType: 'CARD',
                    requestedAt: '2026-04-15T20:15:00Z',
                },
                metadata: {},
            }]);
    });

    it('spec: Card payment requested without a tip', () => {
        given([
            routed('O-2002', 1, 'M-12', 2),
            routed('O-2002', 2, 'D-03', 1),
            served('O-2002', 1),
            served('O-2002', 2),
        ])
            .when(command('p-8a41', 'O-2002', '0.00', 'CARD', '2026-04-15T20:15:00Z'))
            .then([{
                type: 'PaymentRequested',
                data: {
                    paymentId: 'p-8a41',
                    orderNumber: 'O-2002',
                    tableNumber: '12',
                    subtotal: SUBTOTAL,
                    serviceCharge: SERVICE_CHARGE,
                    taxAmount: TAX_AMOUNT,
                    tipAmount: '0.00',
                    totalAmount: '48.97',
                    paymentType: 'CARD',
                    requestedAt: '2026-04-15T20:15:00Z',
                },
                metadata: {},
            }]);
    });

    it('spec: Payment cannot be requested twice while one is pending', () => {
        given([
            routed('O-2003', 1, 'M-12', 2),
            served('O-2003', 1),
            requested('p-9b52', 'O-2003', '5.00'),
        ])
            .when(command('p-9b53', 'O-2003', '5.00', 'CARD', '2026-04-15T20:16:00Z'))
            .thenThrows((error: any) => error.code === 'payment_pending');
    });

    it('spec: Payment cannot be requested for an already paid order', () => {
        given([
            routed('O-2004', 1, 'M-12', 2),
            served('O-2004', 1),
            requested('p-ac63', 'O-2004', '5.00'),
            paid('O-2004', '53.97'),
        ])
            .when(command('p-ac64', 'O-2004', '5.00', 'CARD', '2026-04-15T20:17:00Z'))
            .thenThrows((error: any) => error.code === 'already_paid');
    });

    it('spec: Payment cannot be requested for an order with no routed lines', () => {
        given([])
            .when(command('p-bd74', 'O-2005', '0.00', 'CARD', '2026-04-15T20:15:00Z'))
            .thenThrows((error: any) => error.code === 'no_routed_lines');
    });

    it('spec: A negative tip is rejected', () => {
        given([
            routed('O-2006', 1, 'M-12', 2),
            served('O-2006', 1),
        ])
            .when(command('p-ce85', 'O-2006', '-1.00', 'CARD', '2026-04-15T20:15:00Z'))
            .thenThrows((error: any) => error.code === 'negative_tip');
    });

    it('computes the tipped total as PaymentSummary.totalAmount + tipAmount', () => {
        assert.strictEqual(totalWithTip('41.50', '4.15', '3.32', '5.00'), '53.97');
        assert.strictEqual(totalWithTip('41.50', '4.15', '3.32', '0.00'), '48.97');
    });
});

describe('RequestPayment storyline: Card payment authorized', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: RequestPaymentInitialState,
    });

    // The storyline's beats before the COMMAND are a READMODEL ("Priced bill for the
    // table" = PaymentSummary) and an HTML_SCREEN, neither of which is an event. The
    // priced bill only exists once lines were routed and served, which is exactly the
    // `given` every non-error specification of this slice uses, so those same events
    // stand in for that READMODEL beat here.
    //
    // Only PaymentRequested is asserted. The storyline's next EVENT beat ("Provider
    // approves the card") is AuthorizationApproved, emitted by SubmitAuthorizationApproval
    // - it is not in this slice's events[], so this decider never produces it.
    it('storyline: Card payment is requested -> PaymentRequested', () => {
        given([
            routed('O-2007', 1, 'M-12', 2),
            routed('O-2007', 2, 'D-03', 1),
            served('O-2007', 1),
            served('O-2007', 2),
        ])
            .when(command('p-df96', 'O-2007', '5.00', 'CARD', '2026-04-15T20:15:00Z'))
            .then([{
                type: 'PaymentRequested',
                data: {
                    paymentId: 'p-df96',
                    orderNumber: 'O-2007',
                    tableNumber: '12',
                    subtotal: SUBTOTAL,
                    serviceCharge: SERVICE_CHARGE,
                    taxAmount: TAX_AMOUNT,
                    tipAmount: '5.00',
                    totalAmount: '53.97',
                    paymentType: 'CARD',
                    requestedAt: '2026-04-15T20:15:00Z',
                },
                metadata: {},
            }]);
    });
});
