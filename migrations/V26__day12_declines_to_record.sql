-- ============================================================
-- Day12 / DeclinesToRecord read model (Day14 - Payment Declined chapter)
--
-- Which declined card authorizations still have to be recorded as a declined
-- payment? Same two-event shape as AuthorizationsToRecord: the order/money
-- fields come from PaymentRequested, the decline fields from
-- AuthorizationDeclined.
--
-- A request with no provider answer yet is NOT a todo, so the PaymentRequested
-- half is staged in its own requests table and the visible row is only created
-- once AuthorizationDeclined lands.
--
-- The read model has no cardBrand column even though AuthorizationDeclined
-- carries one - slice.json's fields[] deliberately omits it.
--
-- PaymentDeclined is not an INBOUND dependency: a recorded decline stays on the
-- list.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day12_declines_to_record_requests
(
    payment_id   TEXT PRIMARY KEY,
    order_number TEXT    NOT NULL,
    table_number TEXT    NOT NULL,
    total_amount NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS public.day12_declines_to_record
(
    payment_id         TEXT PRIMARY KEY,
    order_number       TEXT      NOT NULL,
    table_number       TEXT      NOT NULL,
    total_amount       NUMERIC   NOT NULL,
    decline_reason     TEXT      NOT NULL,
    decline_code       TEXT      NOT NULL,
    masked_card_number TEXT      NOT NULL,
    declined_at        TIMESTAMP NOT NULL
);
