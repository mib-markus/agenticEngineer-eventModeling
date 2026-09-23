import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    PayOrderCommand,
    PayOrderInitialState,
    decide,
    evolve,
} from './PayOrderCommand';

describe('PayOrder Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: PayOrderInitialState,
    });

    const command = (
        orderNumber: string,
        amountPaid: string,
        paymentMethod: string,
        paidAt: string,
        tableNumber = '12',
    ): PayOrderCommand => ({
        type: 'PayOrder',
        data: {orderNumber, tableNumber, amountPaid, paymentMethod},
        metadata: {paidAt},
    });

    const routed = (orderNumber: string, lineNumber: number, itemNumber: string, quantity: number, specialWishes: string, station: string) => ({
        type: 'OrderLineRoutedToStation' as const,
        data: {
            orderNumber,
            tableNumber: '12',
            lineNumber,
            itemNumber,
            quantity,
            specialWishes,
            station,
            routedAt: '2026-04-15T19:18:05Z',
        },
        metadata: {},
    });

    const started = (orderNumber: string, lineNumber: number, station: string, startedAt: string) => ({
        type: 'ItemPreparationStarted' as const,
        data: {orderNumber, tableNumber: '12', lineNumber, station, startedAt},
        metadata: {},
    });

    const ready = (orderNumber: string, lineNumber: number, station: string, readyAt: string) => ({
        type: 'ItemMarkedReady' as const,
        data: {orderNumber, tableNumber: '12', lineNumber, station, readyAt},
        metadata: {},
    });

    const served = (orderNumber: string, lineNumber: number, serverName: string, servedAt: string) => ({
        type: 'ItemServed' as const,
        data: {orderNumber, tableNumber: '12', lineNumber, serverName, servedAt},
        metadata: {},
    });

    const paid = (orderNumber: string, amountPaid: string, paymentMethod: string, paidAt: string) => ({
        type: 'OrderPaid' as const,
        data: {orderNumber, tableNumber: '12', amountPaid, paymentMethod, paidAt},
        metadata: {},
    });

    it('spec: The bill is paid once every item was served', () => {
        given([
            routed('O-1042', 1, 'M-12', 2, 'without onions', 'kitchen'),
            started('O-1042', 1, 'kitchen', '2026-04-15T19:20:00Z'),
            ready('O-1042', 1, 'kitchen', '2026-04-15T19:34:00Z'),
            served('O-1042', 1, 'Anna', '2026-04-15T19:36:00Z'),
        ])
            .when(command('O-1042', '37.00', 'card', '2026-04-15T20:15:00Z'))
            .then([{
                type: 'OrderPaid',
                data: {
                    orderNumber: 'O-1042',
                    tableNumber: '12',
                    amountPaid: '37.00',
                    paymentMethod: 'card',
                    paidAt: '2026-04-15T20:15:00Z',
                },
                metadata: {},
            }]);
    });

    it('spec: An order with an unprepared item cannot be paid', () => {
        given([
            routed('O-1042', 1, 'M-12', 2, 'without onions', 'kitchen'),
            started('O-1042', 1, 'kitchen', '2026-04-15T19:20:00Z'),
        ])
            .when(command('O-1042', '37.00', 'card', '2026-04-15T20:15:00Z'))
            .thenThrows((error: any) => error.code === 'unprepared_item');
    });

    it('spec: An already paid order cannot be paid again', () => {
        given([
            routed('O-1042', 1, 'M-12', 2, 'without onions', 'kitchen'),
            started('O-1042', 1, 'kitchen', '2026-04-15T19:20:00Z'),
            ready('O-1042', 1, 'kitchen', '2026-04-15T19:34:00Z'),
            served('O-1042', 1, 'Anna', '2026-04-15T19:36:00Z'),
            paid('O-1042', '37.00', 'card', '2026-04-15T20:15:00Z'),
        ])
            .when(command('O-1042', '37.00', 'cash', '2026-04-15T20:16:00Z'))
            .thenThrows((error: any) => error.code === 'already_paid');
    });
});
