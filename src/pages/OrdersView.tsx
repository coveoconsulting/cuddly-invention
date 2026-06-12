import { useEffect, useMemo, useState } from "react";
import { CircleCheckBig, Plus } from "lucide-react";
import type { Order, OrderStatus } from "../types";
import { getJson, patchJson, postJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import {
  approvalStatusLabel,
  approvalTone,
  formatCurrency,
  orderStatusLabel,
  orderStatusTone,
  syncStatusLabel,
} from "../lib/labels";
import { useWorkspace } from "../context/WorkspaceContext";

type StatusFilter = "all" | OrderStatus;

export function OrdersView() {
  const { company, can } = useWorkspace();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    clientName: "",
    amount: "",
    discount: "0",
    notes: "",
  });

  const loadOrders = async () => {
    setIsLoading(true);
    try {
      const payload = await getJson<Order[]>("/api/v1/orders");
      setOrders(payload);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => filter === "all" || order.status === filter);
  }, [filter, orders]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    await postJson("/api/v1/orders", {
      clientName: form.clientName,
      amount: Number(form.amount),
      discount: Number(form.discount),
      notes: form.notes,
    });
    setShowCreate(false);
    setForm({ clientName: "", amount: "", discount: "0", notes: "" });
    await loadOrders();
  };

  const handleApprove = async (order: Order) => {
    await patchJson(`/api/v1/orders/${order.id}/status`, {
      status: "confirmed",
      approvalStatus: "approved",
    });
    await loadOrders();
  };

  if (!company) {
    return null;
  }

  return (
    <div className="p-4 md:p-6 max-w-[1440px] mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-sm text-secondary">Commandes et validations</p>
          <h1 className="text-3xl font-black text-on-surface mt-1">Flux de commandes</h1>
        </div>
        {can("orders.write") ? (
          <Button className="gap-2 self-start" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />
            Nouvelle commande
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: "all", label: "Toutes" },
          { key: "draft", label: "Brouillons" },
          { key: "awaiting_approval", label: "Validation requise" },
          { key: "confirmed", label: "Confirmees" },
          { key: "delivered", label: "Livrees" },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key as StatusFilter)}
            className={`rounded-full px-4 py-2 text-sm font-semibold border transition-colors ${
              filter === item.key
                ? "bg-primary text-on-primary border-primary"
                : "bg-surface border-outline-variant text-secondary hover:bg-surface-container"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-10 text-center text-secondary">
          Chargement des commandes...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredOrders.map((order) => (
            <div key={order.id} className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-black text-on-surface">{order.id}</p>
                  <p className="text-sm text-secondary mt-1">{order.clientName}</p>
                </div>
                <Badge variant={orderStatusTone(order.status)}>{orderStatusLabel[order.status]}</Badge>
              </div>
              <div className="space-y-2 text-sm text-secondary">
                <div className="flex justify-between">
                  <span>Montant</span>
                  <span className="font-bold text-on-surface">{formatCurrency(order.amount, company.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Remise</span>
                  <span>{order.discount}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Responsable</span>
                  <span>{order.ownerName}</span>
                </div>
                <div className="flex justify-between">
                  <span>Territoire</span>
                  <span>{order.territoryLabel}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={approvalTone(order.approvalStatus)}>
                  {approvalStatusLabel[order.approvalStatus]}
                </Badge>
                <Badge variant="neutral">{syncStatusLabel[order.syncStatus]}</Badge>
              </div>
              <p className="text-xs text-secondary min-h-10">{order.notes || "Aucune note."}</p>
              {can("orders.approve") && order.approvalStatus === "pending" ? (
                <Button variant="outline" className="w-full justify-center" onClick={() => handleApprove(order)}>
                  <CircleCheckBig className="w-4 h-4 mr-2" />
                  Approuver et confirmer
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {showCreate ? (
        <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreate} className="w-full max-w-lg rounded-3xl border border-outline-variant bg-surface-container-lowest p-6 shadow-xl space-y-4">
            <div>
              <p className="text-sm font-bold text-on-surface">Nouvelle commande</p>
              <p className="text-xs text-secondary mt-1">Les remises elevees declenchent une validation.</p>
            </div>
            <input className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder="Client" value={form.clientName} onChange={(event) => setForm({ ...form, clientName: event.target.value })} required />
            <div className="grid md:grid-cols-2 gap-4">
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" type="number" placeholder="Montant" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required />
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" type="number" min="0" max="100" placeholder="Remise %" value={form.discount} onChange={(event) => setForm({ ...form, discount: event.target.value })} />
            </div>
            <textarea className="w-full min-h-28 rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Annuler</Button>
              <Button type="submit">Enregistrer</Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
