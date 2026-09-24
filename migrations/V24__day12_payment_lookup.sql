-- ============================================================
-- Day12 / payment lookup (Day14 chapter)
--
-- Resolves paymentId -> tableNumber (plus the orderNumber the payment belongs
-- to) so the payment provider's callback commands, which carry only the
-- paymentId, can find the Day12-table-{tableNumber} stream that holds the
-- matching PaymentRequested.
--
-- Same role as day12_order_lookup: it answers "where does this payment live",
-- never "may this callback proceed" — every precondition stays in decide(),
-- checked against the replayed events.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day12_payment_lookup
(
    payment_id   TEXT PRIMARY KEY,
    table_number TEXT NOT NULL,
    order_number TEXT NOT NULL
);
