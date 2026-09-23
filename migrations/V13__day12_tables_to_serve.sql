-- ============================================================
-- Day12 / TablesToServe read model
--
-- A server's round for the day: one row per confirmed reservation, seeded
-- when ReservationConfirmed lands. reservation_code is globally unique, so
-- it is the primary key; date is indexed since the server's own query is
-- "which tables do I serve today?".
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day12_tables_to_serve
(
    reservation_code TEXT PRIMARY KEY,
    table_number     TEXT NOT NULL,
    date             TEXT NOT NULL,
    start_time       TEXT NOT NULL,
    end_time         TEXT NOT NULL,
    created_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS day12_tables_to_serve_date_idx
    ON public.day12_tables_to_serve (date);
