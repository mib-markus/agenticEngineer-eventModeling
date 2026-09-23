import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    StartItemPreparationCommand,
    StartItemPreparationInitialState,
    decide,
    evolve,
} from './StartItemPreparationCommand';

describe('StartItemPreparation Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: StartItemPreparationInitialState,
    });

    const STARTED_AT = '2026-04-15T19:20:00Z';

    const command = (
        orderNumber: string,
        lineNumber: number,
        station: string,
        tableNumber = '12',
    ): StartItemPreparationCommand => ({
        type: 'StartItemPreparation',
        data: {orderNumber, tableNumber, lineNumber, station},
        metadata: {startedAt: STARTED_AT},
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

    it('spec: Kitchen starts preparing a routed line', () => {
        given([
            routed('O-1042', 1, 'M-12', 2, 'without onions', 'kitchen'),
        ])
            .when(command('O-1042', 1, 'kitchen'))
            .then([{
                type: 'ItemPreparationStarted',
                data: {
                    orderNumber: 'O-1042',
                    tableNumber: '12',
                    lineNumber: 1,
                    station: 'kitchen',
                    startedAt: STARTED_AT,
                },
                metadata: {},
            }]);
    });

    it('spec: A line that was never routed cannot be started', () => {
        given([])
            .when(command('O-1042', 9, 'kitchen'))
            .thenThrows((error: any) => error.code === 'line_not_routed');
    });

    it('spec: A line already in preparation cannot be started again', () => {
        given([
            routed('O-1042', 1, 'M-12', 2, 'without onions', 'kitchen'),
            started('O-1042', 1, 'kitchen', '2026-04-15T19:20:00Z'),
        ])
            .when(command('O-1042', 1, 'kitchen'))
            .thenThrows((error: any) => error.code === 'already_started');
    });
});
