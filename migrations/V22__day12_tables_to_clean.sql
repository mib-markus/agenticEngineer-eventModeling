-- ============================================================
-- Day12 / TablesToClean read model
--
-- Which tables have to be cleaned? A row is seeded once TableClosed
-- lands, and leaves the list for good once TableFreedForReassignment
-- lands for it.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day12_tables_to_clean
(
    table_number TEXT PRIMARY KEY,
    order_number TEXT      NOT NULL,
    closed_at    TIMESTAMP NOT NULL,
    created_at   TIMESTAMP DEFAULT NOW()
);
