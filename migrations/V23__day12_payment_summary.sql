-- ============================================================
-- Day12 / PaymentSummary read model (Day14 chapter)
--
-- The priced bill the server is shown on the PaymentScreen before a card
-- payment is requested. Structurally a header + lines read model (see
-- TableBill): a routed line appears priced from the catalogue and is flagged
-- once served, while the order-level money fields (subtotal, serviceCharge,
-- taxAmount, totalAmount) are aggregates derived from the lines and are
-- therefore computed in the route, not stored.
--
-- An order with no routed lines has no summary at all.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day12_payment_summary_catalog
(
    item_number TEXT PRIMARY KEY,
    price       NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS public.day12_payment_summary
(
    order_number TEXT PRIMARY KEY,
    table_number TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.day12_payment_summary_lines
(
    order_number TEXT    NOT NULL,
    line_number  INTEGER NOT NULL,
    item_number  TEXT    NOT NULL,
    quantity     INTEGER NOT NULL,
    unit_price   NUMERIC NOT NULL,
    line_served  BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (order_number, line_number)
);
