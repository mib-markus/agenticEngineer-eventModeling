-- ============================================================
-- Day7 / AutoSeatingCandidates read model
--
-- Reservations still waiting for a table, driving the auto-seating processor.
-- A row is seeded Pending when the reservation is placed, moves to Held once a
-- table hold lands for it, and moves to Failed once that hold is released —
-- a released hold means the second-step checks (blacklist, payment, window)
-- rejected the guest, so the row leaves the automated queue for good and stays
-- with staff for manual confirmation, rather than being retried. There is no
-- seat-capacity data in this system, so the processor itself walks table
-- numbers rather than this read model picking a candidate.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day7_auto_seating_candidates
(
    reservation_code     TEXT PRIMARY KEY,
    e_mail               TEXT NOT NULL,
    date                 TEXT NOT NULL,
    start_time           TEXT NOT NULL,
    end_time             TEXT NOT NULL,
    number_of_people     TEXT NOT NULL,
    auto_seating_outcome TEXT NOT NULL,
    created_at           TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS day7_auto_seating_candidates_date_idx
    ON public.day7_auto_seating_candidates (date);
