import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    CloseTableCommand,
    CloseTableInitialState,
    decide,
    evolve,
} from './CloseTableCommand';

describe('CloseTable Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: CloseTableInitialState,
    });

    const command = (
        orderNumber: string,
        closedAt: string,
        tableNumber = '12',
    ): CloseTableCommand => ({
        type: 'CloseTable',
        data: {orderNumber, tableNumber},
        metadata: {closedAt},
    });

    const paid = (orderNumber: string, tableNumber = '12') => ({
        type: 'OrderPaid' as const,
        data: {
            orderNumber,
            tableNumber,
            amountPaid: '37.00',
            paymentMethod: 'card',
            paidAt: '2026-04-15T20:15:00Z',
        },
        metadata: {},
    });

    const served = (orderNumber: string, lineNumber: number, serverName: string, servedAt: string, tableNumber = '12') => ({
        type: 'ItemServed' as const,
        data: {orderNumber, tableNumber, lineNumber, serverName, servedAt},
        metadata: {},
    });

    const closed = (orderNumber: string, closedAt: string, tableNumber = '12') => ({
        type: 'TableClosed' as const,
        data: {orderNumber, tableNumber, closedAt},
        metadata: {},
    });

    it('spec: A paid table is closed', () => {
        given([
            paid('O-1042'),
        ])
            .when(command('O-1042', '2026-04-15T20:17:00Z'))
            .then([{
                type: 'TableClosed',
                data: {
                    orderNumber: 'O-1042',
                    tableNumber: '12',
                    closedAt: '2026-04-15T20:17:00Z',
                },
                metadata: {},
            }]);
    });

    it('spec: An unpaid table cannot be closed', () => {
        given([
            served('O-2071', 1, 'Anna', '2026-04-15T19:36:00Z'),
        ])
            .when(command('O-2071', '2026-04-15T20:17:00Z'))
            .thenThrows((error: any) => error.code === 'unpaid_table');
    });

    it('spec: An already closed table cannot be closed again', () => {
        given([
            paid('O-9999'),
            closed('O-9999', '2026-04-15T20:17:00Z'),
        ])
            .when(command('O-9999', '2026-04-15T20:19:00Z'))
            .thenThrows((error: any) => error.code === 'already_closed');
    });
});
