-- ============================================================
-- Day7 / RemindersDue read model
--
-- The due list that drives the reservation reminder. As with NoShowsDue there is
-- no clock event in the model, so "due" is not a stored flag: the row carries the
-- moment its reminder window opens and the query filters on a caller-supplied
-- `now`.
--
-- remind_at is the board's DD.MM.YYYY HH:MM stamp, which does not compare as
-- text. remind_at_sortable holds the same instant as YYYY-MM-DDTHH:MM purely so
-- the "is it due yet" predicate can be a plain SQL comparison.
--
-- A reservation leaves the list once it has been reminded, and also when it is
-- cancelled — a guest who is not coming gets no reminder.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day7_reminders_due
(
    reservation_code  TEXT PRIMARY KEY,
    e_mail            TEXT NOT NULL,
    date              TEXT NOT NULL,
    start_time        TEXT NOT NULL,
    table_number      TEXT NOT NULL,
    remind_at         TEXT NOT NULL,
    remind_at_sortable TEXT NOT NULL,
    created_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS day7_reminders_due_remind_idx
    ON public.day7_reminders_due (remind_at_sortable);
