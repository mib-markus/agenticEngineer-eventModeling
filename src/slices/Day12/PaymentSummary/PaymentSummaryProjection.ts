import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {sql, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import {
    type OrderableItemAdded,
    type OrderLineRoutedToStation,
    type ItemServed,
} from '../Day12Events';

// A STATE_VIEW can need a lookup table fed by an unrelated event stream: the price
// per item only exists on the catalogue's own OrderableItemAdded, never on a routed
// line, so it is upserted here and joined at routing time (same shape as TableBill).
export const catalogTableName = 'day12_payment_summary_catalog';
export const tableName = 'day12_payment_summary';
export const linesTableName = 'day12_payment_summary_lines';

export type PaymentSummaryLine = {
    lineNumber: number;
    itemNumber: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
    lineServed: boolean;
};

export type PaymentSummaryReadModel = {
    orderNumber: string;
    tableNumber: string;
    lineNumber: number[];
    itemNumber: string[];
    quantity: number[];
    unitPrice: string[];
    lineTotal: string[];
    lineServed: boolean[];
    subtotal: string;
    serviceCharge: string;
    taxAmount: string;
    totalAmount: string;
};

export const getKnexInstance = (): Knex => knex({client: 'pg'});

type PaymentSummaryEvents =
    | OrderableItemAdded
    | OrderLineRoutedToStation
    | ItemServed;

export const PaymentSummaryProjection = postgreSQLRawSQLProjection<PaymentSummaryEvents>({
    name: 'PaymentSummaryProjection',
    canHandle: ['OrderableItemAdded', 'OrderLineRoutedToStation', 'ItemServed'],
    evolve: async (event): Promise<SQL[]> => {
        const db = getKnexInstance();

        switch (event.type) {
            case 'OrderableItemAdded':
                return [sql(db(catalogTableName)
                    .withSchema('public')
                    .insert({
                        item_number: event.data.itemNumber,
                        price: event.data.price,
                    })
                    .onConflict('item_number')
                    .merge(['price'])
                    .toQuery())];

            case 'OrderLineRoutedToStation': {
                // The catalogue join is the string form on purpose — the object-form
                // alias breaks silently under .withSchema().
                const withPrice = db(`${catalogTableName} as c`)
                    .withSchema('public')
                    .where('c.item_number', event.data.itemNumber)
                    .select(
                        db.raw('? as order_number', [event.data.orderNumber]),
                        db.raw('? as line_number', [event.data.lineNumber]),
                        db.raw('? as item_number', [event.data.itemNumber]),
                        db.raw('? as quantity', [event.data.quantity]),
                        'c.price as unit_price',
                    );

                return [
                    sql(db(tableName)
                        .withSchema('public')
                        .insert({
                            order_number: event.data.orderNumber,
                            table_number: event.data.tableNumber,
                        })
                        .onConflict('order_number')
                        .merge(['table_number'])
                        .toQuery()),
                    sql(db(linesTableName)
                        .withSchema('public')
                        .insert(withPrice)
                        .onConflict(['order_number', 'line_number'])
                        .merge(['item_number', 'quantity', 'unit_price'])
                        .toQuery()),
                ];
            }

            case 'ItemServed':
                // lineServed is `derived:ItemServed.lineNumber present` — the line stays
                // on the summary and is flagged, it is not removed: an unserved line is
                // still priced on the bill, just marked.
                return [sql(db(linesTableName)
                    .withSchema('public')
                    .where({
                        order_number: event.data.orderNumber,
                        line_number: event.data.lineNumber,
                    })
                    .update({line_served: true})
                    .toQuery())];

            default:
                return [];
        }
    },
});

// The money fields are all `aggregate:` mappings over the List-cardinality lines, so
// they are computed in application code (no SQL precedent for this in the codebase).
export const SERVICE_CHARGE_RATE = 0.10;
export const TAX_RATE = 0.08;

export const summaryTotals = (lines: {unitPrice: string; quantity: number}[]) => {
    const subtotal = lines.reduce((sum, l) => sum + Number(l.unitPrice) * l.quantity, 0);
    const serviceCharge = subtotal * SERVICE_CHARGE_RATE;
    const taxAmount = subtotal * TAX_RATE;
    const totalAmount = subtotal + serviceCharge + taxAmount;
    return {
        subtotal: subtotal.toFixed(2),
        serviceCharge: serviceCharge.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
    };
};

export const lineTotalOf = (unitPrice: string, quantity: number): string =>
    (Number(unitPrice) * quantity).toFixed(2);
