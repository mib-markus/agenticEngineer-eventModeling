-- ============================================================
-- Day12 / OrderLinesToRoute read model
--
-- Which submitted lines still have to be routed to a station? A line only
-- waits here once its order has been submitted to the kitchen; edits before
-- submission (add/change/remove) are tracked in a working table, exactly like
-- KitchenQueue's own working/frozen split. Once a line is routed to a station
-- it leaves this list, so the frozen row is deleted on OrderLineRoutedToStation
-- rather than merely flagged.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day12_route_working_lines
(
    order_number   TEXT NOT NULL,
    line_number    INTEGER NOT NULL,
    item_number    TEXT NOT NULL,
    quantity       INTEGER NOT NULL,
    special_wishes TEXT NOT NULL,
    PRIMARY KEY (order_number, line_number)
);

CREATE TABLE IF NOT EXISTS public.day12_route_catalog
(
    item_number TEXT PRIMARY KEY,
    category    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.day12_lines_to_route
(
    order_number   TEXT NOT NULL,
    table_number   TEXT NOT NULL,
    line_number    INTEGER NOT NULL,
    item_number    TEXT NOT NULL,
    quantity       INTEGER NOT NULL,
    special_wishes TEXT NOT NULL,
    category       TEXT NOT NULL,
    PRIMARY KEY (order_number, line_number)
);
