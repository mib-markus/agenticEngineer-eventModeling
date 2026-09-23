-- ============================================================
-- Day7 / HeldReservations read model
--
-- Holds waiting for their second-step checks (blacklist, upfront-payment
-- details, hold window). A row is seeded when TableHeldForReservation lands,
-- and leaves the list for good once either ReservationConfirmed (checks
-- passed) or TableHoldReleased (checks failed) lands for it.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day7_held_reservations
(
    reservation_code TEXT PRIMARY KEY,
    table_number     TEXT NOT NULL,
    e_mail           TEXT NOT NULL,
    date             TEXT NOT NULL,
    start_time       TEXT NOT NULL,
    end_time         TEXT NOT NULL,
    created_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS day7_held_reservations_date_idx
    ON public.day7_held_reservations (date);
