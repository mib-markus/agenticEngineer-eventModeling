import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    RouteOrderLineToStationCommand,
    RouteOrderLineToStationInitialState,
    decide,
    evolve,
} from './RouteOrderLineToStationCommand';

describe('RouteOrderLineToStation Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: RouteOrderLineToStationInitialState,
    });

    const ROUTED_AT = '2026-04-15T19:18:05Z';

    const command = (
        orderNumber: string,
        lineNumber: number,
        itemNumber: string,
        quantity: number,
        specialWishes: string,
        station: string,
        tableNumber = '12',
    ): RouteOrderLineToStationCommand => ({
        type: 'RouteOrderLineToStation',
        data: {orderNumber, tableNumber, lineNumber, itemNumber, quantity, specialWishes, station},
        metadata: {routedAt: ROUTED_AT},
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
            routedAt: ROUTED_AT,
        },
        metadata: {},
    });

    it('spec: A submitted menu item is routed to the kitchen', () => {
        given([
            lineAdded('O-1042', 1, 'M-12', 2, 'without onions'),
        ])
            .when(command('O-1042', 1, 'M-12', 2, 'without onions', 'kitchen'))
            .then([{
                type: 'OrderLineRoutedToStation',
                data: {
                    orderNumber: 'O-1042',
                    tableNumber: '12',
                    lineNumber: 1,
                    itemNumber: 'M-12',
                    quantity: 2,
                    specialWishes: 'without onions',
                    station: 'kitchen',
                    routedAt: ROUTED_AT,
                },
                metadata: {},
            }]);
    });

    it('spec: A submitted drink is routed to the bar', () => {
        given([
            lineAdded('O-1042', 2, 'D-7', 1, ''),
        ])
            .when(command('O-1042', 2, 'D-7', 1, '', 'bar'))
            .then([{
                type: 'OrderLineRoutedToStation',
                data: {
                    orderNumber: 'O-1042',
                    tableNumber: '12',
                    lineNumber: 2,
                    itemNumber: 'D-7',
                    quantity: 1,
                    specialWishes: '',
                    station: 'bar',
                    routedAt: ROUTED_AT,
                },
                metadata: {},
            }]);
    });

    it('spec: An already routed line is not routed twice', () => {
        given([
            lineAdded('O-1046', 1, 'M-12', 2, 'without onions'),
            routed('O-1046', 1, 'M-12', 2, 'without onions', 'kitchen'),
        ])
            .when(command('O-1046', 1, 'M-12', 2, 'without onions', 'kitchen'))
            .thenThrows((error: any) => error.code === 'already_routed');
    });

    it('spec: An item whose category maps to no station is rejected', () => {
        given([
            lineAdded('O-1042', 3, 'X-1', 1, ''),
        ])
            .when(command('O-1042', 3, 'X-1', 1, '', ''))
            .thenThrows((error: any) => error.code === 'station_not_determined');
    });

    it('spec: A line removed before submission is never routed', () => {
        given([
            lineAdded('O-1042', 1, 'M-12', 2, 'without onions'),
            lineRemoved('O-1042', 1, 'Guest changed their mind'),
        ])
            .when(command('O-1042', 1, 'M-12', 2, 'without onions', 'kitchen'))
            .thenThrows((error: any) => error.code === 'line_not_found');
    });
});
