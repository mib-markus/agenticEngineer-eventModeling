import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    ChangeOrderLineCommand,
    ChangeOrderLineInitialState,
    decide,
    evolve,
} from './ChangeOrderLineCommand';

describe('Change Order Line Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: ChangeOrderLineInitialState,
    });

    const command = (
        orderNumber: string,
        lineNumber: number,
        quantity: number,
        specialWishes: string,
    ): ChangeOrderLineCommand => ({
        type: 'ChangeOrderLine',
        data: {orderNumber, lineNumber, quantity, specialWishes},
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

    it('spec: The guest wants three instead of two', () => {
        given([
            opened('O-1042'),
            lineAdded('O-1042', 1, 'M-12', 2, 'without onions'),
        ])
            .when(command('O-1042', 1, 3, 'without onions'))
            .then([{
                type: 'OrderLineChanged',
                data: {
                    orderNumber: 'O-1042',
                    lineNumber: 1,
                    quantity: 3,
                    specialWishes: 'without onions',
                },
                metadata: {},
            }]);
    });

    it('spec: A special wish is added after the fact', () => {
        given([
            opened('O-1042'),
            lineAdded('O-1042', 1, 'M-12', 2, ''),
        ])
            .when(command('O-1042', 1, 2, 'without onions, extra fries'))
            .then([{
                type: 'OrderLineChanged',
                data: {
                    orderNumber: 'O-1042',
                    lineNumber: 1,
                    quantity: 2,
                    specialWishes: 'without onions, extra fries',
                },
                metadata: {},
            }]);
    });

    it('spec: A line that is not on the pad cannot be changed', () => {
        given([
            opened('O-1042'),
            lineAdded('O-1042', 1, 'M-12', 2, ''),
        ])
            .when(command('O-1042', 7, 1, ''))
            .thenThrows((error: any) => error.code === 'line_not_found');
    });

    it('spec: A line already struck off cannot be changed', () => {
        given([
            opened('O-1042'),
            lineAdded('O-1042', 1, 'M-12', 2, ''),
            lineRemoved('O-1042', 1, 'Guest changed their mind'),
        ])
            .when(command('O-1042', 1, 3, ''))
            .thenThrows((error: any) => error.code === 'line_already_removed');
    });

    it('spec: Nothing can be changed once the order went to the kitchen', () => {
        given([
            opened('O-1042'),
            lineAdded('O-1042', 1, 'M-12', 2, ''),
            submitted('O-1042'),
        ])
            .when(command('O-1042', 1, 3, ''))
            .thenThrows((error: any) => error.code === 'order_already_submitted');
    });

    it('spec: A line on an order that was never opened cannot be changed', () => {
        given([])
            .when(command('O-9999', 1, 1, ''))
            .thenThrows((error: any) => error.code === 'line_not_found');
    });
});
