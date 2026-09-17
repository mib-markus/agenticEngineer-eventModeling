-- ============================================================
-- Day7 / TableStatus read model
--
-- Day6's TableStatus answered "which tables do confirmed reservations hold".
-- Day7 wires two more events into the same read model, so a table stops being
-- free in four ways rather than Day6's three:
--
--   ReservationConfirmed          - a guest holds the table
--   ReservationCancelled          - the guest freed it
--   TableBlocked                  - the host took it out of service
--   ReservationReleasedAsNoShow   - the grace period expired, so it is free again
--
-- The board's field list is unchanged from Day6, so a block reuses the row shape:
-- it occupies a table for a time window exactly as a reservation does. Block rows
-- carry a derived BLOCK-... reservation_code, which is stable for a given table,
-- day and window — that is what makes a redelivered TableBlocked idempotent.
--
-- number_of_people is nullable because a block has no party size.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day7_table_status
(
    reservation_code TEXT PRIMARY KEY,
    table_number     TEXT,
    date             TEXT NOT NULL,
    start_time       TEXT NOT NULL,
    end_time         TEXT NOT NULL,
    number_of_people TEXT,
    created_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS day7_table_status_table_date_idx
    ON public.day7_table_status (table_number, date);
