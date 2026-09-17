-- ============================================================
-- Day7 / NoShowsDue read model
--
-- The due list that drives the no-show release. There is no clock event in the
-- model, so "due" is not a stored flag: the row carries the moment its grace
-- period expires and the query filters on a caller-supplied `now`.
--
-- grace_ends_at is the board's DD.MM.YYYY HH:MM stamp, which does not compare
-- as text. grace_ends_at_sortable holds the same instant as YYYY-MM-DDTHH:MM
-- purely so the "is it due yet" predicate can be a plain SQL comparison.
--
-- A reservation leaves the list once it has been released, and never joins it
-- if it was cancelled — a cancelled reservation is not a no-show.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day7_no_shows_due
(
    reservation_code       TEXT PRIMARY KEY,
    e_mail                 TEXT NOT NULL,
    date                   TEXT NOT NULL,
    start_time             TEXT NOT NULL,
    table_number           TEXT NOT NULL,
    grace_ends_at          TEXT NOT NULL,
    grace_ends_at_sortable TEXT NOT NULL,
    created_at             TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS day7_no_shows_due_grace_idx
    ON public.day7_no_shows_due (grace_ends_at_sortable);
