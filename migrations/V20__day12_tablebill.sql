-- ============================================================
-- Day12 / TableBill read model
--
-- What does this table owe? A routed line appears on the bill with its
-- price, looked up from the catalogue at the moment it is routed to a
-- station, and stays there (marked served) rather than disappearing —
-- unlike StationQueue/ReadyItemsForServer, a served line still belongs on
-- the bill. An order with no routed lines has no bill at all.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day12_tablebill_catalog
(
    item_number TEXT PRIMARY KEY,
    price       NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS public.day12_tablebill
(
    order_number TEXT PRIMARY KEY,
    table_number TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.day12_tablebill_lines
(
    order_number TEXT    NOT NULL,
    line_number  INTEGER NOT NULL,
    item_number  TEXT    NOT NULL,
    quantity     INTEGER NOT NULL,
    unit_price   NUMERIC NOT NULL,
    line_served  BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (order_number, line_number)
);
