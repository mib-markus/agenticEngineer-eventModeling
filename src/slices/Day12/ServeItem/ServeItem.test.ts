import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    ServeItemCommand,
    ServeItemInitialState,
    decide,
    evolve,
} from './ServeItemCommand';

describe('ServeItem Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: ServeItemInitialState,
    });

    const command = (
        orderNumber: string,
        lineNumber: number,
        serverName: string,
        servedAt: string,
        tableNumber = '12',
    ): ServeItemCommand => ({
        type: 'ServeItem',
        data: {orderNumber, tableNumber, lineNumber, serverName},
        metadata: {servedAt},
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

    it('spec: Server serves a ready item', () => {
        given([
            routed('O-1042', 1, 'M-12', 2, 'without onions', 'kitchen'),
            started('O-1042', 1, 'kitchen', '2026-04-15T19:20:00Z'),
            ready('O-1042', 1, 'kitchen', '2026-04-15T19:34:00Z'),
        ])
            .when(command('O-1042', 1, 'Anna', '2026-04-15T19:36:00Z'))
            .then([{
                type: 'ItemServed',
                data: {
                    orderNumber: 'O-1042',
                    tableNumber: '12',
                    lineNumber: 1,
                    serverName: 'Anna',
                    servedAt: '2026-04-15T19:36:00Z',
                },
                metadata: {},
            }]);
    });

    it('spec: An item that is not ready cannot be served', () => {
        given([
            routed('O-1042', 1, 'M-12', 2, 'without onions', 'kitchen'),
            started('O-1042', 1, 'kitchen', '2026-04-15T19:20:00Z'),
        ])
            .when(command('O-1042', 1, 'Anna', '2026-04-15T19:36:00Z'))
            .thenThrows((error: any) => error.code === 'item_not_ready');
    });

    it('spec: An already served item cannot be served again', () => {
        given([
            routed('O-1042', 1, 'M-12', 2, 'without onions', 'kitchen'),
            started('O-1042', 1, 'kitchen', '2026-04-15T19:20:00Z'),
            ready('O-1042', 1, 'kitchen', '2026-04-15T19:34:00Z'),
            served('O-1042', 1, 'Anna', '2026-04-15T19:36:00Z'),
        ])
            .when(command('O-1042', 1, 'Ben', '2026-04-15T19:40:00Z'))
            .thenThrows((error: any) => error.code === 'already_served');
    });
});
