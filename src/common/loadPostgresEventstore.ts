import {getPostgreSQLEventStore} from "@event-driven-io/emmett-postgresql";
import {projections} from "@event-driven-io/emmett";
import {postgresUrl, getSharedPool} from "./db";
import {TableStatusProjection} from "../slices/Day6/TableStatus/TableStatusProjection";
import {ReservationLookupProjection} from "../slices/Day6/ConfirmReservation/ReservationLookupProjection";

let eventStoreInstance: ReturnType<typeof getPostgreSQLEventStore> | null = null;

export const findEventstore = async () => {
    if (!eventStoreInstance) {
        eventStoreInstance = getPostgreSQLEventStore(postgresUrl, {
            schema: {
                autoMigration: "CreateOrUpdate"
            },
            connectionOptions: {
                pooled: true,
                pool: getSharedPool(),
            },
            projections: projections.inline([
                TableStatusProjection,
                ReservationLookupProjection,
            ]),
        });
        await eventStoreInstance.schema.migrate();
    }
    return eventStoreInstance;
};
