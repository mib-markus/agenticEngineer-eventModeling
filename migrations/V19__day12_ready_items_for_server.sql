-- ============================================================
-- Day12 / ReadyItemsForServer read model
--
-- Which ready items does a server have to bring out? A line appears here
-- once it is marked ready, and leaves once it has been served.
-- ItemMarkedReady doesn't carry itemNumber, so a lookup fed by
-- OrderLineRoutedToStation supplies it at the moment the row is created.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day12_ready_items_catalog
(
    order_number TEXT    NOT NULL,
    line_number  INTEGER NOT NULL,
    item_number  TEXT    NOT NULL,
    PRIMARY KEY (order_number, line_number)
);

CREATE TABLE IF NOT EXISTS public.day12_ready_items_for_server
(
    order_number TEXT      NOT NULL,
    table_number TEXT      NOT NULL,
    line_number  INTEGER   NOT NULL,
    item_number  TEXT      NOT NULL,
    station      TEXT      NOT NULL,
    ready_at     TIMESTAMP NOT NULL,
    PRIMARY KEY (order_number, line_number)
);
