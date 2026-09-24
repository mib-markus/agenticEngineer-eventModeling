-- ============================================================
-- Day12 / DeclinedPayments read model (Day14 - Payment Declined chapter)
--
-- What the server is shown after a card is declined: the order, the amount, the
-- reason, and how many attempts this order has already cost.
--
-- The read model's idAttribute is tableNumber, not paymentId - a table shows the
-- decline of whatever payment is currently outstanding on it, so one row per table
-- that replaces itself on each new decline.
--
-- attemptCount is mapped `aggregate:count(PaymentDeclined per orderNumber)`. A retry
-- issues a *fresh* paymentId against the same orderNumber, so the counter increments
-- while order_number is unchanged and resets to 1 when a new order starts declining
-- at the same table.
--
-- totalAmount and tipAmount come from PaymentRequested, not PaymentDeclined, and a
-- request with no decline yet must show nothing ("No declines means nothing to show"),
-- so the PaymentRequested half is staged in its own payment-keyed table and the
-- visible row is only created once PaymentDeclined lands.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day12_declined_payments_requests
(
    payment_id   TEXT PRIMARY KEY,
    total_amount NUMERIC NOT NULL,
    tip_amount   NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS public.day12_declined_payments
(
    table_number   TEXT PRIMARY KEY,
    payment_id     TEXT      NOT NULL,
    order_number   TEXT      NOT NULL,
    total_amount   NUMERIC   NOT NULL,
    tip_amount     NUMERIC   NOT NULL,
    decline_reason TEXT      NOT NULL,
    attempt_count  INTEGER   NOT NULL,
    declined_at    TIMESTAMP NOT NULL
);
