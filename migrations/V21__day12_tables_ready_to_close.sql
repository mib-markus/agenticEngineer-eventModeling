-- ============================================================
-- Day12 / TablesReadyToClose read model
--
-- Which tables can be closed? A row is seeded once OrderPaid lands, and
-- leaves the list for good once TableClosed lands for it.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day12_tables_ready_to_close
(
    order_number TEXT PRIMARY KEY,
    table_number TEXT      NOT NULL,
    amount_paid  NUMERIC   NOT NULL,
    paid_at      TIMESTAMP NOT NULL,
    created_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS day12_tables_ready_to_close_table_number_idx
    ON public.day12_tables_ready_to_close (table_number);
