import type { RunRecord } from "../engine/schema";
import {
  SOFTWARE_FACTORY,
  toFactoryWorkOrder,
  withSoftwareFactory,
  type Outbox,
} from "./software-factory";
import {
  claimDelivery,
  finishDelivery,
  getConnection,
  getProjectLink,
} from "./store";

/*
 * Sends a finished run's work orders to the project it is linked to in
 * Software Factory. Each work order is sent once: a send is claimed in the
 * database before it is made, so two attempts, or an attempt after a
 * restart, never create it twice. A failure is recorded, never thrown: a
 * run does not fail because a connector did.
 */

export type DeliveryOutcome =
  | { sent: number; failed: number }
  /** Nothing was sent, and why. */
  | { skipped: string };

export type OpenOutbox = <T>(
  externalProjectId: string,
  work: (outbox: Outbox) => Promise<T>,
) => Promise<T>;

export async function deliverRun(
  run: RunRecord,
  options: {
    /** True when a person asked for it: sample runs are then sent too. */
    manual?: boolean;
    /** Stands in for Software Factory in tests. */
    open?: OpenOutbox;
  } = {},
): Promise<DeliveryOutcome> {
  if (run.status !== "completed") return { skipped: "The run did not finish." };
  if (run.workOrders.length === 0) return { skipped: "No work orders." };
  if (!run.projectId) return { skipped: "The run belongs to no project." };

  const [connection, link] = await Promise.all([
    getConnection(SOFTWARE_FACTORY),
    getProjectLink(run.projectId, SOFTWARE_FACTORY),
  ]);
  if (!link) return { skipped: "The project is not linked to 8090." };
  if (connection.status !== "connected") {
    return { skipped: "8090 is not connected." };
  }
  if (run.sample && !options.manual && !connection.settings.sendSampleRuns) {
    return { skipped: "Sample runs are not sent." };
  }

  // Claim first, so nothing is ever sent that another attempt already took.
  const mine = [];
  for (const workOrder of run.workOrders) {
    if (await claimDelivery(run.id, workOrder.id, SOFTWARE_FACTORY)) {
      mine.push(workOrder);
    }
  }
  if (mine.length === 0) return { sent: 0, failed: 0 };

  const payloads = mine.map((workOrder) => ({
    workOrder,
    payload: toFactoryWorkOrder(run, workOrder),
  }));
  const fail = (workOrderId: string, error: unknown) =>
    finishDelivery(run.id, workOrderId, SOFTWARE_FACTORY, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });

  let sent = 0;
  let failed = 0;
  try {
    await (options.open ?? withSoftwareFactory)(link, async (outbox) => {
      await outbox.ensureLabels([
        ...new Set(payloads.flatMap((item) => item.payload.label_titles)),
      ]);
      for (const { workOrder, payload } of payloads) {
        try {
          const made = await outbox.create(payload);
          await finishDelivery(run.id, workOrder.id, SOFTWARE_FACTORY, {
            ok: true,
            ...made,
          });
          sent += 1;
        } catch (error) {
          await fail(workOrder.id, error);
          failed += 1;
        }
      }
    });
  } catch (error) {
    // The connection itself failed: everything not yet settled is failed.
    for (const { workOrder } of payloads.slice(sent + failed)) {
      await fail(workOrder.id, error);
      failed += 1;
    }
  }
  return { sent, failed };
}
