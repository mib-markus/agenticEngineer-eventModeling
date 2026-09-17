-- ============================================================
-- Day6 / reservation stream lookup
--
-- ReservationPlaced is streamed by eMail, but ConfirmReservation and
-- CancelReservation carry only reservationCode — so a handler has no way to
-- find the stream it must replay. This resolves reservationCode -> eMail.
--
-- Not modelled on the board: it resolves a stream id, it does not validate the
-- command. The preconditions themselves are still checked against the replayed
-- event stream in decide().
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day6_reservation_lookup
(
    reservation_code  TEXT PRIMARY KEY,
    e_mail            TEXT NOT NULL,
    created_at        TIMESTAMP DEFAULT NOW()
);
