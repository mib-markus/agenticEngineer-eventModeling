-- ============================================================
-- Day12 / OrderableItems read model
--
-- The guest-facing catalogue for one restaurant. Menu items and drinks share
-- the same shape (itemNumber/name/category/price), distinguished only by
-- category. A restaurant with no published items simply has no rows.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day12_orderable_items
(
    restaurant_id TEXT NOT NULL,
    item_number   TEXT NOT NULL,
    name          TEXT NOT NULL,
    category      TEXT NOT NULL,
    price         NUMERIC NOT NULL,
    created_at    TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (restaurant_id, item_number)
);

CREATE INDEX IF NOT EXISTS day12_orderable_items_restaurant_idx
    ON public.day12_orderable_items (restaurant_id);
