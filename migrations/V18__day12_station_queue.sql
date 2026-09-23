-- ============================================================
-- Day12 / StationQueue read model
--
-- What does a station (kitchen/bar/dessert) still have to prepare? A line
-- appears here once it is routed to a station, and leaves once its
-- preparation has started.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day12_station_queue
(
    station        TEXT NOT NULL,
    order_number    TEXT NOT NULL,
    table_number    TEXT NOT NULL,
    line_number     INTEGER NOT NULL,
    item_number     TEXT NOT NULL,
    quantity        INTEGER NOT NULL,
    special_wishes  TEXT NOT NULL,
    routed_at       TIMESTAMP NOT NULL,
    PRIMARY KEY (order_number, line_number)
);
