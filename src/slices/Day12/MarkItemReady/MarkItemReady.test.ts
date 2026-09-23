import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    MarkItemReadyCommand,
    MarkItemReadyInitialState,
    decide,
    evolve,
} from './MarkItemReadyCommand';

describe('MarkItemReady Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: MarkItemReadyInitialState,
    });

    const command = (
        orderNumber: string,
        lineNumber: number,
        station: string,
        readyAt: string,
        tableNumber = '12',
    ): MarkItemReadyCommand => ({
        type: 'MarkItemReady',
        data: {orderNumber, tableNumber, lineNumber, station},
        metadata: {readyAt},
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

    it('spec: Kitchen marks a line in preparation as ready', () => {
        given([
            routed('O-1042', 1, 'M-12', 2, 'without onions', 'kitchen'),
            started('O-1042', 1, 'kitchen', '2026-04-15T19:20:00Z'),
        ])
            .when(command('O-1042', 1, 'kitchen', '2026-04-15T19:34:00Z'))
            .then([{
                type: 'ItemMarkedReady',
                data: {
                    orderNumber: 'O-1042',
                    tableNumber: '12',
                    lineNumber: 1,
                    station: 'kitchen',
                    readyAt: '2026-04-15T19:34:00Z',
                },
                metadata: {},
            }]);
    });

    it('spec: A line that was never started cannot be marked ready', () => {
        given([
            routed('O-1042', 1, 'M-12', 2, 'without onions', 'kitchen'),
        ])
            .when(command('O-1042', 1, 'kitchen', '2026-04-15T19:34:00Z'))
            .thenThrows((error: any) => error.code === 'line_not_started');
    });

    it('spec: A line already ready cannot be marked ready again', () => {
        given([
            routed('O-1042', 1, 'M-12', 2, 'without onions', 'kitchen'),
            started('O-1042', 1, 'kitchen', '2026-04-15T19:20:00Z'),
            ready('O-1042', 1, 'kitchen', '2026-04-15T19:34:00Z'),
        ])
            .when(command('O-1042', 1, 'kitchen', '2026-04-15T19:35:00Z'))
            .thenThrows((error: any) => error.code === 'already_ready');
    });
});
