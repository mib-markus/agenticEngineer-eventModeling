-- ============================================================
-- Day6 / TableStatus read model
--
-- One row per reservation. A row only counts as a table *hold* once
-- table_number is set by ReservationConfirmed; a placed-but-unconfirmed
-- reservation holds no table, so its table_number stays NULL and the
-- query filters it out.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day6_table_status
(
    reservation_code  TEXT PRIMARY KEY,
    table_number      TEXT,
    date              TEXT NOT NULL,
    start_time        TEXT NOT NULL,
    end_time          TEXT NOT NULL,
    number_of_people  TEXT NOT NULL,
    created_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS day6_table_status_date_table_idx
    ON public.day6_table_status (date, table_number);
