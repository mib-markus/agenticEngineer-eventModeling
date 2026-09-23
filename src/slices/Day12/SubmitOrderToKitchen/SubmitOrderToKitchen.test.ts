import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    SubmitOrderToKitchenCommand,
    SubmitOrderToKitchenInitialState,
    decide,
    evolve,
} from './SubmitOrderToKitchenCommand';

describe('Submit Order To Kitchen Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: SubmitOrderToKitchenInitialState,
    });

    const command = (
        orderNumber: string,
        submittedAt: string,
    ): SubmitOrderToKitchenCommand => ({
        type: 'SubmitOrderToKitchen',
        data: {orderNumber, submittedAt},
        metadata: {},
    });

    const opened = (orderNumber: string, tableNumber = '12', serverName = 'Anna', openedAt = '2026-04-15T19:05:00Z') => ({
        type: 'OrderOpened' as const,
        data: {orderNumber, tableNumber, serverName, openedAt},
        metadata: {},
    });

    const lineAdded = (orderNumber: string, lineNumber: number, itemNumber: string, quantity: number, specialWishes: string) => ({
        type: 'OrderLineAdded' as const,
        data: {orderNumber, lineNumber, itemNumber, quantity, specialWishes},
        metadata: {},
    });

    const lineRemoved = (orderNumber: string, lineNumber: number, reason: string) => ({
        type: 'OrderLineRemoved' as const,
        data: {orderNumber, lineNumber, reason},
        metadata: {},
    });

    const submitted = (orderNumber: string, tableNumber = '12', submittedAt = '2026-04-15T19:18:00Z') => ({
        type: 'OrderSubmittedToKitchen' as const,
        data: {orderNumber, tableNumber, submittedAt},
        metadata: {},
    });

    it('spec: The waiter hands the pad to the kitchen', () => {
        given([
            opened('O-1042'),
            lineAdded('O-1042', 1, 'M-12', 2, 'without onions'),
        ])
            .when(command('O-1042', '2026-04-15T19:18:00Z'))
            .then([{
                type: 'OrderSubmittedToKitchen',
                data: {
                    orderNumber: 'O-1042',
                    tableNumber: '12',
                    submittedAt: '2026-04-15T19:18:00Z',
                },
                metadata: {},
            }]);
    });

    it('spec: An empty pad is not handed to the kitchen', () => {
        given([
            opened('O-1042'),
        ])
            .when(command('O-1042', '2026-04-15T19:18:00Z'))
            .thenThrows((error: any) => error.code === 'pad_is_empty');
    });

    it('spec: A pad whose every line was struck off is not handed to the kitchen', () => {
        given([
            opened('O-1042'),
            lineAdded('O-1042', 1, 'M-12', 2, ''),
            lineRemoved('O-1042', 1, 'Guest changed their mind'),
        ])
            .when(command('O-1042', '2026-04-15T19:18:00Z'))
            .thenThrows((error: any) => error.code === 'pad_is_empty');
    });

    it('spec: The same pad is not handed in twice', () => {
        given([
            opened('O-1042'),
            lineAdded('O-1042', 1, 'M-12', 2, ''),
            submitted('O-1042'),
        ])
            .when(command('O-1042', '2026-04-15T19:25:00Z'))
            .thenThrows((error: any) => error.code === 'pad_already_submitted');
    });

    it('spec: A pad that was never opened cannot be handed in', () => {
        given([])
            .when(command('O-9999', '2026-04-15T19:18:00Z'))
            .thenThrows((error: any) => error.code === 'pad_never_opened');
    });
});
