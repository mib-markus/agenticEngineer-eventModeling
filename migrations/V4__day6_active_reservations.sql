-- The guest-facing list of a guest's own live reservations. Deliberately a separate
-- table from day6_table_status: that one answers "is this table free at this time",
-- keyed by table, while this one answers "what has this guest booked", keyed by guest.
-- Merging them would make either question's specifications hard to state.
CREATE TABLE IF NOT EXISTS public.day6_active_reservations
(
    reservation_code TEXT PRIMARY KEY,
    e_mail           TEXT NOT NULL,
    date             TEXT NOT NULL,
    start_time       TEXT NOT NULL,
    end_time         TEXT NOT NULL,
    number_of_people TEXT NOT NULL,
    table_number     TEXT,
    created_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS day6_active_reservations_email_idx
    ON public.day6_active_reservations (e_mail);
