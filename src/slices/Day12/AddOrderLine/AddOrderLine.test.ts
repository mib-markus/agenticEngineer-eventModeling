import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    AddOrderLineCommand,
    AddOrderLineInitialState,
    decide,
    evolve,
} from './AddOrderLineCommand';

describe('Add Order Line Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: AddOrderLineInitialState,
    });

    const command = (
        orderNumber: string,
        itemNumber: string,
        quantity: number,
        specialWishes: string,
    ): AddOrderLineCommand => ({
        type: 'AddOrderLine',
        data: {orderNumber, itemNumber, quantity, specialWishes},
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

    const submitted = (orderNumber: string, tableNumber = '12', submittedAt = '2026-04-15T19:18:00Z') => ({
        type: 'OrderSubmittedToKitchen' as const,
        data: {orderNumber, tableNumber, submittedAt},
        metadata: {},
    });

    it('spec: A menu item is written onto the open pad', () => {
        given([opened('O-1042')])
            .when(command('O-1042', 'M-12', 2, 'without onions'))
            .then([{
                type: 'OrderLineAdded',
                data: {
                    orderNumber: 'O-1042',
                    lineNumber: 1,
                    itemNumber: 'M-12',
                    quantity: 2,
                    specialWishes: 'without onions',
                },
                metadata: {},
            }]);
    });

    it('spec: A drink is added as its own line with no special wishes', () => {
        given([
            opened('O-1042'),
            lineAdded('O-1042', 1, 'M-12', 2, 'without onions'),
        ])
            .when(command('O-1042', 'D-7', 1, ''))
            .then([{
                type: 'OrderLineAdded',
                data: {
                    orderNumber: 'O-1042',
                    lineNumber: 2,
                    itemNumber: 'D-7',
                    quantity: 1,
                    specialWishes: '',
                },
                metadata: {},
            }]);
    });

    it('spec: The same dish ordered twice with different wishes becomes two lines', () => {
        given([
            opened('O-1042'),
            lineAdded('O-1042', 1, 'M-12', 2, 'without onions'),
        ])
            .when(command('O-1042', 'M-12', 1, 'extra crispy'))
            .then([{
                type: 'OrderLineAdded',
                data: {
                    orderNumber: 'O-1042',
                    lineNumber: 2,
                    itemNumber: 'M-12',
                    quantity: 1,
                    specialWishes: 'extra crispy',
                },
                metadata: {},
            }]);
    });

    it('spec: Nothing can be written on a pad that was never opened', () => {
        given([])
            .when(command('O-9999', 'M-12', 2, ''))
            .thenThrows((error: any) => error.code === 'unknown_order');
    });

    it('spec: Nothing can be added once the order went to the kitchen', () => {
        given([
            opened('O-1042'),
            submitted('O-1042'),
        ])
            .when(command('O-1042', 'D-7', 1, ''))
            .thenThrows((error: any) => error.code === 'order_already_submitted');
    });
});
