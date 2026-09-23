-- ============================================================
-- Day12 / KitchenQueue read model
--
-- What does the kitchen have to prepare? A snapshot of an order's lines is
-- frozen the moment OrderSubmittedToKitchen lands - later changes to the pad
-- (which can't happen post-submission anyway, per Submit Order To Kitchen's
-- own guards) never affect what the kitchen already saw. Until submission,
-- the order must not appear in this read model at all, so line edits before
-- that point are tracked in a working table and only copied into the frozen
-- queue tables at submission time.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day12_kitchen_working_lines
(
    order_number   TEXT NOT NULL,
    line_number    INTEGER NOT NULL,
    item_number    TEXT NOT NULL,
    quantity       INTEGER NOT NULL,
    special_wishes TEXT NOT NULL,
    PRIMARY KEY (order_number, line_number)
);

CREATE TABLE IF NOT EXISTS public.day12_kitchen_queue
(
    order_number  TEXT PRIMARY KEY,
    table_number  TEXT NOT NULL,
    submitted_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS public.day12_kitchen_queue_lines
(
    order_number   TEXT NOT NULL,
    line_number    INTEGER NOT NULL,
    item_number    TEXT NOT NULL,
    quantity       INTEGER NOT NULL,
    special_wishes TEXT NOT NULL,
    PRIMARY KEY (order_number, line_number)
);
