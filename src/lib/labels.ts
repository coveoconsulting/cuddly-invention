import type {
  ApprovalStatus,
  NotificationLevel,
  OrderStatus,
  PipelineStage,
  RiskLevel,
  SyncStatus,
  VisitStatus,
} from "../types";

export type BadgeTone = "default" | "success" | "warning" | "error" | "neutral";

export const pipelineStageLabel: Record<PipelineStage, string> = {
  qualification: "Qualification",
  proposal: "Proposition",
  negotiation: "Négociation",
  won: "Gagné",
  lost: "Perdu",
};

export const visitStatusLabel: Record<VisitStatus, string> = {
  planned: "Planifiée",
  in_progress: "En cours",
  completed: "Terminée",
  missed: "Manquée",
  cancelled: "Annulée",
};

export const orderStatusLabel: Record<OrderStatus, string> = {
  draft: "Brouillon",
  awaiting_approval: "Validation requise",
  confirmed: "Confirmée",
  delivered: "Livrée",
  cancelled: "Annulée",
};

export const approvalStatusLabel: Record<ApprovalStatus, string> = {
  not_required: "Sans validation",
  pending: "En attente",
  approved: "Approuvée",
  rejected: "Refusée",
};

export const syncStatusLabel: Record<SyncStatus, string> = {
  not_synced: "Non synchronisé",
  queued: "En file de sync",
  synced: "Synchronisé",
};

export const riskLabel: Record<RiskLevel, string> = {
  low: "Faible",
  medium: "Moyen",
  high: "Élevé",
};

export function visitStatusTone(status: VisitStatus): BadgeTone {
  switch (status) {
    case "completed":
      return "success";
    case "in_progress":
      return "warning";
    case "missed":
    case "cancelled":
      return "error";
    default:
      return "neutral";
  }
}

export function opportunityStageTone(stage: PipelineStage): BadgeTone {
  switch (stage) {
    case "won":
      return "success";
    case "lost":
      return "error";
    case "negotiation":
      return "warning";
    default:
      return "default";
  }
}

export function orderStatusTone(status: OrderStatus): BadgeTone {
  switch (status) {
    case "confirmed":
    case "delivered":
      return "success";
    case "awaiting_approval":
      return "warning";
    case "cancelled":
      return "error";
    default:
      return "neutral";
  }
}

export function approvalTone(status: ApprovalStatus): BadgeTone {
  switch (status) {
    case "approved":
    case "not_required":
      return "success";
    case "pending":
      return "warning";
    case "rejected":
      return "error";
    default:
      return "neutral";
  }
}

export function notificationTone(level: NotificationLevel): BadgeTone {
  switch (level) {
    case "critical":
      return "error";
    case "warning":
      return "warning";
    default:
      return "default";
  }
}

export function formatCurrency(amount: number, currency = "MAD") {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string | null | undefined) {
  if (!date) {
    return "-";
  }
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
  }).format(new Date(date));
}

export function formatDateTime(date: string | null | undefined) {
  if (!date) {
    return "-";
  }
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(date));
}
