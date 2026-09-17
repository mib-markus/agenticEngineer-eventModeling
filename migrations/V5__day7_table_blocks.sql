-- ============================================================
-- Day7 / TableBlocks read model
--
-- One row per block. A table can be blocked several times on the same
-- service day (different hours, different reasons), so the key is the
-- table plus the exact window rather than the table alone.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day7_table_blocks
(
    table_number TEXT NOT NULL,
    date         TEXT NOT NULL,
    start_time   TEXT NOT NULL,
    end_time     TEXT NOT NULL,
    reason       TEXT NOT NULL,
    created_at   TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (table_number, date, start_time, end_time)
);

CREATE INDEX IF NOT EXISTS day7_table_blocks_date_table_idx
    ON public.day7_table_blocks (date, table_number);
