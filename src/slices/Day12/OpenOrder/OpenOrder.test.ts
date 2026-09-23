import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    OpenOrderCommand,
    OpenOrderInitialState,
    decide,
    evolve,
} from './OpenOrderCommand';

describe('Open Order Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: OpenOrderInitialState,
    });

    const command = (
        orderNumber: string,
        tableNumber: string,
        serverName: string,
        openedAt: string,
    ): OpenOrderCommand => ({
        type: 'OpenOrder',
        data: {orderNumber, tableNumber, serverName, openedAt},
        metadata: {},
    });

    it('spec: A server opens a fresh order for a seated table', () => {
        given([])
            .when(command('O-1042', '12', 'Anna', '2026-04-15T19:05:00Z'))
            .then([{
                type: 'OrderOpened',
                data: {
                    orderNumber: 'O-1042',
                    tableNumber: '12',
                    serverName: 'Anna',
                    openedAt: '2026-04-15T19:05:00Z',
                },
                metadata: {},
            }]);
    });

    it('spec: A walk-in table with no reservation can still be served', () => {
        given([])
            .when(command('O-1043', '3', 'Ben', '2026-04-15T19:07:00Z'))
            .then([{
                type: 'OrderOpened',
                data: {
                    orderNumber: 'O-1043',
                    tableNumber: '3',
                    serverName: 'Ben',
                    openedAt: '2026-04-15T19:07:00Z',
                },
                metadata: {},
            }]);
    });

    it('spec: A second pad cannot be opened while the table still has an open order', () => {
        given([{
            type: 'OrderOpened' as const,
            data: {
                orderNumber: 'O-1042',
                tableNumber: '12',
                serverName: 'Anna',
                openedAt: '2026-04-15T19:05:00Z',
            },
            metadata: {},
        }])
            .when(command('O-1044', '12', 'Ben', '2026-04-15T19:09:00Z'))
            .thenThrows((error: any) => error.code === 'table_already_has_open_order');
    });

    it('spec: After the first round went to the kitchen a new pad may be opened', () => {
        given([
            {
                type: 'OrderOpened' as const,
                data: {
                    orderNumber: 'O-1042',
                    tableNumber: '12',
                    serverName: 'Anna',
                    openedAt: '2026-04-15T19:05:00Z',
                },
                metadata: {},
            },
            {
                type: 'OrderSubmittedToKitchen' as const,
                data: {
                    orderNumber: 'O-1042',
                    tableNumber: '12',
                    submittedAt: '2026-04-15T19:18:00Z',
                },
                metadata: {},
            },
        ])
            .when(command('O-1051', '12', 'Anna', '2026-04-15T20:02:00Z'))
            .then([{
                type: 'OrderOpened',
                data: {
                    orderNumber: 'O-1051',
                    tableNumber: '12',
                    serverName: 'Anna',
                    openedAt: '2026-04-15T20:02:00Z',
                },
                metadata: {},
            }]);
    });
});
