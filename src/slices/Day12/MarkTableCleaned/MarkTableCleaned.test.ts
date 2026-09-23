import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    MarkTableCleanedCommand,
    MarkTableCleanedInitialState,
    decide,
    evolve,
} from './MarkTableCleanedCommand';

describe('MarkTableCleaned Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: MarkTableCleanedInitialState,
    });

    const command = (
        orderNumber: string,
        cleanedAt: string,
        tableNumber = '12',
    ): MarkTableCleanedCommand => ({
        type: 'MarkTableCleaned',
        data: {tableNumber, orderNumber},
        metadata: {cleanedAt},
    });

    const closed = (orderNumber: string, closedAt: string, tableNumber = '12') => ({
        type: 'TableClosed' as const,
        data: {orderNumber, tableNumber, closedAt},
        metadata: {},
    });

    const freed = (orderNumber: string, cleanedAt: string, tableNumber = '12') => ({
        type: 'TableFreedForReassignment' as const,
        data: {tableNumber, orderNumber, cleanedAt},
        metadata: {},
    });

    it('spec: A closed table is freed after cleaning', () => {
        given([
            closed('O-1042', '2026-04-15T20:17:00Z'),
        ])
            .when(command('O-1042', '2026-04-15T20:25:00Z'))
            .then([{
                type: 'TableFreedForReassignment',
                data: {
                    tableNumber: '12',
                    orderNumber: 'O-1042',
                    cleanedAt: '2026-04-15T20:25:00Z',
                },
                metadata: {},
            }]);
    });

    it('spec: A table that was not closed cannot be marked cleaned', () => {
        given([])
            .when(command('O-1042', '2026-04-15T20:25:00Z'))
            .thenThrows((error: any) => error.code === 'table_not_closed');
    });

    it('spec: An already freed table cannot be marked cleaned again', () => {
        given([
            closed('O-1042', '2026-04-15T20:17:00Z'),
            freed('O-1042', '2026-04-15T20:25:00Z'),
        ])
            .when(command('O-1042', '2026-04-15T20:30:00Z'))
            .thenThrows((error: any) => error.code === 'already_cleaned');
    });
});
