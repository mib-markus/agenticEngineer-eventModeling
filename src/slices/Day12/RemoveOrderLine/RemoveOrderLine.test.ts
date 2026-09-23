import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    RemoveOrderLineCommand,
    RemoveOrderLineInitialState,
    decide,
    evolve,
} from './RemoveOrderLineCommand';

describe('Remove Order Line Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: RemoveOrderLineInitialState,
    });

    const command = (
        orderNumber: string,
        lineNumber: number,
        reason: string,
    ): RemoveOrderLineCommand => ({
        type: 'RemoveOrderLine',
        data: {orderNumber, lineNumber, reason},
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

    it('spec: The guest changes their mind and the line is struck off', () => {
        given([
            opened('O-1042'),
            lineAdded('O-1042', 1, 'M-12', 2, 'without onions'),
        ])
            .when(command('O-1042', 1, 'Guest changed their mind'))
            .then([{
                type: 'OrderLineRemoved',
                data: {
                    orderNumber: 'O-1042',
                    lineNumber: 1,
                    reason: 'Guest changed their mind',
                },
                metadata: {},
            }]);
    });

    it('spec: A line the waiter wrote on the wrong pad is struck off', () => {
        given([
            opened('O-1042'),
            lineAdded('O-1042', 2, 'D-7', 1, ''),
        ])
            .when(command('O-1042', 2, 'Written on the wrong pad'))
            .then([{
                type: 'OrderLineRemoved',
                data: {
                    orderNumber: 'O-1042',
                    lineNumber: 2,
                    reason: 'Written on the wrong pad',
                },
                metadata: {},
            }]);
    });

    it('spec: A line that is not on the pad cannot be removed', () => {
        given([
            opened('O-1042'),
        ])
            .when(command('O-1042', 7, 'Guest changed their mind'))
            .thenThrows((error: any) => error.code === 'line_not_found');
    });

    it('spec: The same line cannot be struck off twice', () => {
        given([
            opened('O-1042'),
            lineAdded('O-1042', 1, 'M-12', 2, ''),
            lineRemoved('O-1042', 1, 'Guest changed their mind'),
        ])
            .when(command('O-1042', 1, 'Guest changed their mind'))
            .thenThrows((error: any) => error.code === 'line_already_removed');
    });

    it('spec: Nothing can be removed once the order went to the kitchen', () => {
        given([
            opened('O-1042'),
            lineAdded('O-1042', 1, 'M-12', 2, ''),
            submitted('O-1042'),
        ])
            .when(command('O-1042', 1, 'Guest changed their mind'))
            .thenThrows((error: any) => error.code === 'order_already_submitted');
    });
});
