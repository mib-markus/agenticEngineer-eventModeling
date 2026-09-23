-- ============================================================
-- Day12 / order stream lookup
--
-- OrderOpened is streamed by tableNumber (Day12-table-{tableNumber}), but
-- Add Order Line carries only orderNumber - so a handler has no way to find
-- the stream it must replay. This resolves orderNumber -> tableNumber.
--
-- Not modelled on the board: it resolves a stream id, it does not validate
-- the command. The preconditions themselves are still checked against the
-- replayed event stream in decide().
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day12_order_lookup
(
    order_number TEXT PRIMARY KEY,
    table_number TEXT NOT NULL,
    created_at   TIMESTAMP DEFAULT NOW()
);
