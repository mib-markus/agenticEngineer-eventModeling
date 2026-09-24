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

export type ItemServed = Event<'ItemServed', {
    orderNumber: string;
    tableNumber: string;
    lineNumber: number;
    serverName: string;
    servedAt: string;
}, CommonMeta>;

export type OrderPaid = Event<'OrderPaid', {
    orderNumber: string;
    tableNumber: string;
    amountPaid: string;
    paymentMethod: string;
    paidAt: string;
    // Day14 card payments carry these; the Day13 cash path does not.
    paymentId?: string;
    tipAmount?: string;
}, CommonMeta>;

export type TableClosed = Event<'TableClosed', {
    orderNumber: string;
    tableNumber: string;
    closedAt: string;
}, CommonMeta>;

export type TableFreedForReassignment = Event<'TableFreedForReassignment', {
    tableNumber: string;
    orderNumber: string;
    cleanedAt: string;
}, CommonMeta>;

export type PaymentRequested = Event<'PaymentRequested', {
    paymentId: string;
    orderNumber: string;
    tableNumber: string;
    subtotal: string;
    serviceCharge: string;
    taxAmount: string;
    tipAmount: string;
    totalAmount: string;
    paymentType: string;
    requestedAt: string;
}, CommonMeta>;

// Emitted by the payment provider's callback, not by a user-facing command.
export type AuthorizationApproved = Event<'AuthorizationApproved', {
    paymentId: string;
    authorizationCode: string;
    cardBrand: string;
    maskedCardNumber: string;
    authorizedAmount: string;
    approvedAt: string;
}, CommonMeta>;

export type AuthorizationDeclined = Event<'AuthorizationDeclined', {
    paymentId: string;
    declineReason: string;
    declineCode: string;
    cardBrand: string;
    maskedCardNumber: string;
    declinedAt: string;
}, CommonMeta>;

export type PaymentDeclined = Event<'PaymentDeclined', {
    paymentId: string;
    orderNumber: string;
    tableNumber: string;
    declineReason: string;
    declineCode: string;
    declinedAt: string;
    // RecordPaymentDecline's slice.json events[] lists only the six fields above, so the
    // decider never writes these two. They stay declared - optional - because the card
    // details do reach the system on AuthorizationDeclined and a future slice may carry
    // them forward.
    cardBrand?: string;
    maskedCardNumber?: string;
}, CommonMeta>;

export type PaymentAbandoned = Event<'PaymentAbandoned', {
    tableNumber: string;
    orderNumber: string;
    paymentId: string;
    abandonReason: string;
    serverName: string;
    abandonedAt: string;
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
    | ItemServed
    | OrderPaid
    | TableClosed
    | TableFreedForReassignment
    | PaymentRequested
    | AuthorizationApproved
    | AuthorizationDeclined
    | PaymentDeclined
    | PaymentAbandoned
    | ReservationConfirmed;

export type {ReservationConfirmed};
