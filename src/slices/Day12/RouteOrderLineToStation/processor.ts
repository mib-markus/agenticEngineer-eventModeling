import {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import cron, {ScheduledTask} from 'node-cron';
import {getKnexInstance} from '../../../common/db';
import {storeDlqMessage} from '../../../common/processorDlq';
import {
    OrderLinesToRouteReadModel,
    tableName as orderLinesToRouteTable,
} from '../OrderLinesToRoute/OrderLinesToRouteProjection';
import {
    RouteOrderLineToStationCommand,
    handleRouteOrderLineToStation,
    streamNameFor,
} from './RouteOrderLineToStationCommand';

const PROCESSOR_ID = 'routeorderlinetostation-automation';

// A submitted line waiting to be routed is the state of a read model, not an event, so
// there is nothing for a reactor to subscribe to. This automation drains OrderLinesToRoute
// on a tick instead, same pattern as ConfirmHeldReservation polling HeldReservations.
const SCHEDULE = '* * * * *';

// derived:OrderLinesToRoute.category (Menu->kitchen, Drink->bar, Dessert->dessert)
const STATION_BY_CATEGORY: Record<string, string> = {
    Menu: 'kitchen',
    Drink: 'bar',
    Dessert: 'dessert',
};

// The projection itself removes a line once it is routed (see OrderLinesToRoute's own
// "An already routed line leaves the list" spec), so a redelivery seeing a row twice is the
// expected outcome of the drain racing the projection, not a processing failure.
const isExpectedRejection = (code: string | undefined): boolean =>
    code === 'already_routed' || code === 'line_not_found';

export const routeLine = async (row: OrderLinesToRouteReadModel, routedAt: string): Promise<void> => {
    const station = STATION_BY_CATEGORY[row.category] ?? '';

    const command: RouteOrderLineToStationCommand = {
        type: 'RouteOrderLineToStation',
        data: {
            orderNumber: row.orderNumber,
            tableNumber: row.tableNumber,
            lineNumber: row.lineNumber,
            itemNumber: row.itemNumber,
            quantity: row.quantity,
            specialWishes: row.specialWishes,
            station,
        },
        metadata: {
            routedAt,
            correlation_id: row.orderNumber,
            causation_id: row.orderNumber,
        },
    };

    try {
        await handleRouteOrderLineToStation(row.tableNumber, command);
    } catch (err: any) {
        if (isExpectedRejection(err?.code)) return;

        console.error(`${PROCESSOR_ID}: failed to route ${row.orderNumber}/${row.lineNumber}`, err);
        await storeDlqMessage(
            PROCESSOR_ID,
            {
                type: 'RouteOrderLineToStation',
                data: row,
                metadata: {streamName: streamNameFor(row.tableNumber)},
            } as any,
            err,
        );
    }
};

export const drainLinesToRoute = async (now: Date): Promise<void> => {
    const db = getKnexInstance();

    const lines: OrderLinesToRouteReadModel[] = await db(orderLinesToRouteTable)
        .withSchema('public')
        .select(
            'order_number as orderNumber',
            'table_number as tableNumber',
            'line_number as lineNumber',
            'item_number as itemNumber',
            'quantity',
            'special_wishes as specialWishes',
            'category',
        )
        .orderBy(['order_number', 'line_number']);

    const routedAt = now.toISOString();

    for (const line of lines) {
        await routeLine(line, routedAt);
    }
};

let _task: ScheduledTask | null = null;

export const processor = {
    start: async (_eventStore: PostgresEventStore) => {
        _task = cron.schedule(SCHEDULE, () => {
            drainLinesToRoute(new Date()).catch(err =>
                console.error(`${PROCESSOR_ID} tick failed:`, err),
            );
        });
    },

    stop: async () => {
        await _task?.stop();
        _task = null;
    },
};
