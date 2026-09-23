import type {Event} from '@event-driven-io/emmett';

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

export type Day12Events =
    | OrderableItemAdded;
