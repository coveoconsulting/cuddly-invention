// Phase 0 foundations — the unified commercial tunnel.
//
// `lifecycleStage` is DERIVED, never stored. Today the funnel is fragmented across
// Prospect.status, Opportunity.stage, Quote.status and Order.status. This helper
// collapses the known signals into a single ordered stage so the dashboard, POS map,
// smart routes, manager copilot and reminders can all reason about "where is this
// account in the journey?" the same way — including the post-sale stages (delivery,
// payment, recurring) that the upcoming modules will start emitting.

import type {
  LifecycleStage,
  OrderStatus,
  PipelineStage,
  ProspectStatus,
  QuoteStatus,
} from "../types";

// Left → right ordering of the tunnel. "lost" is terminal and sits outside the rank.
export const LIFECYCLE_ORDER: LifecycleStage[] = [
  "prospect",
  "contacted",
  "qualified",
  "opportunity",
  "quoted",
  "signed",
  "client",
  "order",
  "delivery",
  "payment",
  "recurring",
];

export const lifecycleLabel: Record<LifecycleStage, string> = {
  prospect: "Prospect",
  contacted: "Premier contact",
  qualified: "Qualifié",
  opportunity: "Opportunité",
  quoted: "Devis envoyé",
  signed: "Devis signé",
  client: "Client",
  order: "Commande",
  delivery: "Livraison",
  payment: "Paiement / recouvrement",
  recurring: "Visites récurrentes",
  lost: "Perdu",
};

/** Rank of a stage in the tunnel; -1 for the terminal "lost" branch. */
export function lifecycleRank(stage: LifecycleStage): number {
  return LIFECYCLE_ORDER.indexOf(stage);
}

// All optional: callers pass whatever signals they have loaded. The richer the
// input, the further down the tunnel we can place the account. Post-sale modules
// (delivery, payments) will fill `deliveryStatus` / `hasOpenBalance` once they land.
export interface LifecycleSignals {
  prospectStatus?: ProspectStatus | null;
  isClient?: boolean;
  opportunityStage?: PipelineStage | null;
  quoteStatus?: QuoteStatus | null;
  orderStatus?: OrderStatus | null;
  deliveryStatus?: "to_prepare" | "en_route" | "delivered" | "failed" | "returned" | null;
  /** Outstanding balance / open payment schedule on the account. */
  hasOpenBalance?: boolean;
  /** Account has completed at least one order and keeps being visited. */
  isRecurring?: boolean;
}

// Highest-known stage wins: we read the most advanced signal present, so a client with
// an order in delivery ranks at "delivery" even though prospectStatus is "converted".
export function computeLifecycleStage(signals: LifecycleSignals): LifecycleStage {
  if (signals.prospectStatus === "lost" || signals.opportunityStage === "lost") {
    return "lost";
  }

  // Post-sale signals (most advanced) ----------------------------------------
  if (signals.hasOpenBalance) return "payment";

  if (signals.deliveryStatus) {
    if (signals.deliveryStatus === "delivered" || signals.deliveryStatus === "returned") {
      return signals.isRecurring ? "recurring" : "payment";
    }
    return "delivery";
  }

  if (signals.orderStatus && signals.orderStatus !== "cancelled") return "order";
  if (signals.isRecurring) return "recurring";

  // Sale signals -------------------------------------------------------------
  if (signals.quoteStatus === "signed" || signals.prospectStatus === "converted" || signals.isClient) {
    if (signals.quoteStatus === "signed") return "signed";
    return "client";
  }
  if (signals.quoteStatus === "sent" || signals.prospectStatus === "quoted") return "quoted";

  // Engagement signals -------------------------------------------------------
  if (signals.opportunityStage) return "opportunity";
  if (signals.prospectStatus === "qualified") return "qualified";
  if (signals.prospectStatus === "contacted" || signals.prospectStatus === "negotiation") {
    return signals.prospectStatus === "negotiation" ? "opportunity" : "contacted";
  }

  return "prospect";
}
