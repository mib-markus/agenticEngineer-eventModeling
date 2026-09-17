import {getPostgreSQLEventStore} from "@event-driven-io/emmett-postgresql";
import {projections} from "@event-driven-io/emmett";
import {postgresUrl, getSharedPool} from "./db";
import {TableStatusProjection} from "../slices/Day6/TableStatus/TableStatusProjection";
import {ReservationLookupProjection} from "../slices/Day6/ConfirmReservation/ReservationLookupProjection";
import {ActiveReservationsProjection} from "../slices/Day6/ActiveReservations/ActiveReservationsProjection";
import {TableBlocksProjection} from "../slices/Day7/TableBlocks/TableBlocksProjection";
import {NoShowsDueProjection} from "../slices/Day7/NoShowsDue/NoShowsDueProjection";
import {NoShowNotificationsToSendProjection} from "../slices/Day7/NoShowNotificationsToSend/NoShowNotificationsToSendProjection";
import {RemindersDueProjection} from "../slices/Day7/RemindersDue/RemindersDueProjection";

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
                ActiveReservationsProjection,
                TableBlocksProjection,
                NoShowsDueProjection,
                NoShowNotificationsToSendProjection,
                RemindersDueProjection,
            ]),
        });
        await eventStoreInstance.schema.migrate();
    }
    return eventStoreInstance;
};
