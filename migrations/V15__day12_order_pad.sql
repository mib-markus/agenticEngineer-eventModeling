-- ============================================================
-- Day12 / OrderPad read model
--
-- What is on the pad of this order? One header row per order (opened by
-- OrderOpened, marked submitted once OrderSubmittedToKitchen lands), plus
-- one row per still-active line (OrderLineAdded inserts, OrderLineChanged
-- updates in place, OrderLineRemoved deletes the row). A header can exist
-- with zero lines (see "A struck-off line is gone from the pad").
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day12_order_pad
(
    order_number TEXT PRIMARY KEY,
    table_number TEXT NOT NULL,
    server_name  TEXT NOT NULL,
    submitted    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.day12_order_pad_lines
(
    order_number   TEXT NOT NULL,
    line_number    INTEGER NOT NULL,
    item_number    TEXT NOT NULL,
    quantity       INTEGER NOT NULL,
    special_wishes TEXT NOT NULL,
    created_at     TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (order_number, line_number)
);
