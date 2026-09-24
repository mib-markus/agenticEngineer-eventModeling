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
import {TableStatusProjection as Day7TableStatusProjection} from "../slices/Day7/TableStatus/TableStatusProjection";
import {AutoSeatingCandidatesProjection} from "../slices/Day7/AutoSeatingCandidates/AutoSeatingCandidatesProjection";
import {HeldReservationsProjection} from "../slices/Day7/HeldReservations/HeldReservationsProjection";
import {OrderableItemsProjection} from "../slices/Day12/OrderableItems/OrderableItemsProjection";
import {TablesToServeProjection} from "../slices/Day12/TablesToServe/TablesToServeProjection";
import {OrderLookupProjection} from "../slices/Day12/AddOrderLine/OrderLookupProjection";
import {OrderPadProjection} from "../slices/Day12/OrderPad/OrderPadProjection";
import {KitchenQueueProjection} from "../slices/Day12/KitchenQueue/KitchenQueueProjection";
import {OrderLinesToRouteProjection} from "../slices/Day12/OrderLinesToRoute/OrderLinesToRouteProjection";
import {StationQueueProjection} from "../slices/Day12/StationQueue/StationQueueProjection";
import {ReadyItemsForServerProjection} from "../slices/Day12/ReadyItemsForServer/ReadyItemsForServerProjection";
import {TableBillProjection} from "../slices/Day12/TableBill/TableBillProjection";
import {TablesReadyToCloseProjection} from "../slices/Day12/TablesReadyToClose/TablesReadyToCloseProjection";
import {TablesToCleanProjection} from "../slices/Day12/TablesToClean/TablesToCleanProjection";
import {PaymentSummaryProjection} from "../slices/Day12/PaymentSummary/PaymentSummaryProjection";
import {PaymentLookupProjection} from "../slices/Day12/SubmitAuthorizationApproval/PaymentLookupProjection";
import {AuthorizationsToRecordProjection} from "../slices/Day12/AuthorizationsToRecord/AuthorizationsToRecordProjection";

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
                Day7TableStatusProjection,
                AutoSeatingCandidatesProjection,
                HeldReservationsProjection,
                OrderableItemsProjection,
                TablesToServeProjection,
                OrderLookupProjection,
                OrderPadProjection,
                KitchenQueueProjection,
                OrderLinesToRouteProjection,
                StationQueueProjection,
                ReadyItemsForServerProjection,
                TableBillProjection,
                TablesReadyToCloseProjection,
                TablesToCleanProjection,
                PaymentSummaryProjection,
                PaymentLookupProjection,
                AuthorizationsToRecordProjection,
            ]),
        });
        await eventStoreInstance.schema.migrate();
    }
    return eventStoreInstance;
};
