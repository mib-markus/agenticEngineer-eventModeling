import type {Event} from '@event-driven-io/emmett';
import type {ReservationConfirmed} from '../Day6/Day6Events';

type CommonMeta = {
    stream_name?: string;
    userId?: string;
    correlation_id?: string;
    causation_id?: string;
};

// Emitted by AddOrderableItem, a command in the Restaurant Backoffice context (its own
// slice is not built in this Day12 context). Declared here as a pure-consumer type so
// OrderableItems can react to it — the field shape is copied verbatim from the event's
// own board node, not from the emitting command's slice.
export type OrderableItemAdded = Event<'OrderableItemAdded', {
    itemNumber: string;
    name: string;
    category: string;
    price: string;
    restaurantId: string;
}, CommonMeta>;

export type OrderOpened = Event<'OrderOpened', {
    orderNumber: string;
    tableNumber: string;
    serverName: string;
    openedAt: string;
}, CommonMeta>;

export type OrderLineAdded = Event<'OrderLineAdded', {
    orderNumber: string;
    lineNumber: number;
    itemNumber: string;
    quantity: number;
    specialWishes: string;
}, CommonMeta>;

export type OrderLineChanged = Event<'OrderLineChanged', {
    orderNumber: string;
    lineNumber: number;
    quantity: number;
    specialWishes: string;
}, CommonMeta>;

export type OrderLineRemoved = Event<'OrderLineRemoved', {
    orderNumber: string;
    lineNumber: number;
    reason: string;
}, CommonMeta>;

// Emitted by Submit Order To Kitchen, still Planned in this Day12 context. Declared here
// as a pure-consumer type so Open Order's own guard ("a new pad may be opened once the
// first round went to the kitchen") can evolve on it — the field shape is copied verbatim
// from that slice's own slice.json events[] block.
export type OrderSubmittedToKitchen = Event<'OrderSubmittedToKitchen', {
    orderNumber: string;
    tableNumber: string;
    submittedAt: string;
}, CommonMeta>;

export type OrderLineRoutedToStation = Event<'OrderLineRoutedToStation', {
    orderNumber: string;
    tableNumber: string;
    lineNumber: number;
    itemNumber: string;
    quantity: number;
    specialWishes: string;
    station: string;
    routedAt: string;
}, CommonMeta>;

export type ItemPreparationStarted = Event<'ItemPreparationStarted', {
    orderNumber: string;
    tableNumber: string;
    lineNumber: number;
    station: string;
    startedAt: string;
}, CommonMeta>;

export type ItemMarkedReady = Event<'ItemMarkedReady', {
    orderNumber: string;
    tableNumber: string;
    lineNumber: number;
    station: string;
    readyAt: string;
}, CommonMeta>;

export type Day12Events =
    | OrderableItemAdded
    | OrderOpened
    | OrderLineAdded
    | OrderLineChanged
    | OrderLineRemoved
    | OrderSubmittedToKitchen
    | OrderLineRoutedToStation
    | ItemPreparationStarted
    | ItemMarkedReady
    | ReservationConfirmed;

export type {ReservationConfirmed};
