import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import type { Order } from "../types";
import { ApiError, asArray, getJson, postJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { EmptyState } from "../components/EmptyState";
import { SkeletonCard } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/Dialog";
import { useWorkspace } from "../context/WorkspaceContext";
import { formatCurrency, formatDateTime } from "../lib/labels";

import { useTranslation } from "../i18n";
export function ApprovalsView() {
  const { t } = useTranslation();
  const { company, can } = useWorkspace();
  const toast = useToast();
  const confirm = useConfirm();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const currency = company?.currency || "MAD";

  const load = async () => {
    setIsLoading(true);
    setError("");
    try {
      const payload = await getJson<unknown>("/api/v1/approvals");
      setOrders(asArray<Order>(payload));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Chargement impossible");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const decide = async (order: Order, action: "approve" | "reject") => {
    if (busyId) return;
    let reason = "";
    if (action === "reject") {
      const result = await confirm({
        title: "Refuser cette commande ?",
        description: (
          <>
            <strong>{order.clientName}</strong> · {formatCurrency(order.amount, currency)}
          </>
        ),
        confirmLabel: "Refuser",
        tone: "danger",
        requireReason: true,
        reasonLabel: "Motif du refus",
        reasonPlaceholder: "Expliquez brièvement la décision",
      });
      if (!result.confirmed) return;
      reason = result.reason;
    } else {
      const result = await confirm({
        title: "Valider cette commande ?",
        description: (
          <>
            <strong>{order.clientName}</strong> · {formatCurrency(order.amount, currency)}
            {order.discount > 0 ? ` · remise ${order.discount}%` : ""}
          </>
        ),
        confirmLabel: "Valider",
      });
      if (!result.confirmed) return;
    }
    setBusyId(order.id);
    // Optimistic remove
    setOrders((current) => current.filter((entry) => entry.id !== order.id));
    try {
      await postJson(`/api/v1/approvals/${order.id}/${action}`, { reason });
      toast.success(
        action === "approve" ? "Commande validée" : "Commande refusée",
        { title: order.clientName },
      );
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "Action impossible");
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (!can("approvals.write")) {
    return (
      <div className="p-6">
        <p className="text-sm text-secondary">{t("approvals.auto.accesReserveAuxValideurs")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <div>
        <p className="text-sm text-secondary">{t("approvals.auto.workflow")}</p>
        <h1 className="mt-1 text-3xl font-black text-on-surface">{t("approvals.auto.approbations")}</h1>
        <p className="mt-1 text-sm text-secondary">{t("approvals.auto.commandesEtRemisesEn")}</p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-error/20 bg-error-container p-4 text-sm text-error">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          title={t("approvals.auto.aucuneValidationEnAttente")}
          description="Toutes les commandes sensibles ont été traitées."
        />
      ) : (
        <AnimatePresence initial={false}>
        <motion.div layout className="space-y-3">
          {orders.map((order) => (
            <motion.div
              key={order.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.18 }}
              className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-warning" />
                    <p className="text-sm font-bold text-on-surface">{order.clientName}</p>
                    <Badge variant="warning">{order.approvalStatus}</Badge>
                    {order.discount > 0 ? (
                      <Badge variant="neutral">Remise {order.discount}%</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-secondary">
                    Commande du {formatDateTime(order.date)} · Par {order.ownerName} · {order.territoryLabel}
                  </p>
                  {order.notes ? (
                    <p className="mt-1 text-xs text-secondary">{order.notes}</p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-on-surface">
                    {formatCurrency(order.amount, currency)}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void decide(order, "reject")}
                      loading={busyId === order.id}
                      className="gap-1"
                    >
                      <XCircle className="h-4 w-4" /> Refuser
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void decide(order, "approve")}
                      loading={busyId === order.id}
                      className="gap-1"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Valider
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
