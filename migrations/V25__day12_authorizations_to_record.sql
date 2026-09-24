-- ============================================================
-- Day12 / AuthorizationsToRecord read model (Day14 chapter)
--
-- Which approved card authorizations still have to be recorded as a payment?
-- The read model's fields come from two events: the money/order fields from
-- PaymentRequested, the card/authorization fields from AuthorizationApproved.
--
-- A request whose provider answer has not arrived yet is NOT a todo, so the
-- PaymentRequested half is staged in its own requests table and the visible
-- row is only created when AuthorizationApproved lands (INSERT ... SELECT over
-- the staged request, same shape as TableBill's catalogue join). That makes the
-- "no answer yet => no row" rule structural rather than a filtered flag.
--
-- OrderPaid is deliberately not an INBOUND dependency of this read model: a
-- recorded authorization stays on the list.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day12_authorizations_to_record_requests
(
    payment_id   TEXT PRIMARY KEY,
    order_number TEXT    NOT NULL,
    table_number TEXT    NOT NULL,
    total_amount NUMERIC NOT NULL,
    tip_amount   NUMERIC NOT NULL,
    payment_type TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS public.day12_authorizations_to_record
(
    payment_id          TEXT PRIMARY KEY,
    order_number        TEXT      NOT NULL,
    table_number        TEXT      NOT NULL,
    total_amount        NUMERIC   NOT NULL,
    tip_amount          NUMERIC   NOT NULL,
    payment_type        TEXT      NOT NULL,
    authorization_code  TEXT      NOT NULL,
    card_brand          TEXT      NOT NULL,
    masked_card_number  TEXT      NOT NULL,
    approved_at         TIMESTAMP NOT NULL
);
