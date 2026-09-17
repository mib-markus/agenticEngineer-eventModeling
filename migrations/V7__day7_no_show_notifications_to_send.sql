-- ============================================================
-- Day7 / NoShowNotificationsToSend read model
--
-- The queue of guests who still need to be told their table was released.
-- Unlike day7_no_shows_due this list has no time threshold: a row is added
-- when the release happens and removed when the notice goes out, so the
-- automation can drain it on the event rather than on a tick.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day7_no_show_notifications_to_send
(
    reservation_code TEXT PRIMARY KEY,
    e_mail           TEXT NOT NULL,
    date             TEXT NOT NULL,
    start_time       TEXT NOT NULL,
    created_at       TIMESTAMP DEFAULT NOW()
);
