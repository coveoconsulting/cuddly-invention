import { useEffect, useMemo, useState } from "react";
import { CircleCheckBig, Download, PackagePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { buildCsv, downloadCsv } from "../lib/csv";
import { SkeletonGrid } from "../components/Skeleton";
import type { Order, OrderLine, OrderStatus, Product } from "../types";
import { asArray, getJson, patchJson, postJson, requestJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { useConfirm } from "../components/Dialog";
import { useToast } from "../components/Toast";
import { EmptyState } from "../components/EmptyState";
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
type OrderLineForm = {
  localId: string;
  productId: string;
  productName: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
};

const emptyLine = (): OrderLineForm => ({
  localId: crypto.randomUUID(),
  productId: "",
  productName: "",
  quantity: "1",
  unitPrice: "",
  discountPercent: "0",
});

function lineTotal(line: OrderLine | OrderLineForm) {
  const quantity = Number(line.quantity) || 0;
  const unitPrice = Number(line.unitPrice) || 0;
  const discountPercent = Number(line.discountPercent) || 0;
  return Math.round(quantity * unitPrice * (1 - discountPercent / 100) * 100) / 100;
}

export function OrdersView() {
  const { company, can } = useWorkspace();
  const confirm = useConfirm();
  const toast = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    clientName: "",
    amount: "",
    discount: "0",
    notes: "",
  });
  const [lines, setLines] = useState<OrderLineForm[]>([emptyLine()]);

  const loadOrders = async () => {
    setIsLoading(true);
    try {
      const payload = await getJson<unknown>("/api/v1/orders");
      setOrders(asArray<Order>(payload));
    } finally {
      setIsLoading(false);
    }
  };

  const loadProducts = async () => {
    try {
      const payload = await getJson<unknown>("/api/v1/products");
      setProducts(asArray<Product>(payload).filter((product) => product.status === "active"));
    } catch {
      setProducts([]);
    }
  };

  useEffect(() => {
    void loadOrders();
    void loadProducts();
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => filter === "all" || order.status === filter);
  }, [filter, orders]);

  const computedTotal = useMemo(() => {
    return lines.reduce((total, line) => total + lineTotal(line), 0);
  }, [lines]);

  const updateLine = (localId: string, patch: Partial<OrderLineForm>) => {
    setLines((current) =>
      current.map((line) => {
        if (line.localId !== localId) return line;
        const next = { ...line, ...patch };
        if (patch.productId !== undefined) {
          const product = products.find((entry) => entry.id === patch.productId);
          if (product) {
            next.productName = product.name;
            next.unitPrice = String(product.price);
          }
        }
        return next;
      }),
    );
  };

  const resetCreateForm = () => {
    setForm({ clientName: "", amount: "", discount: "0", notes: "" });
    setLines([emptyLine()]);
    setEditingOrder(null);
  };

  const openCreate = () => {
    resetCreateForm();
    setShowCreate(true);
  };

  const openEdit = (order: Order) => {
    setEditingOrder(order);
    setForm({
      clientName: order.clientName,
      amount: String(order.amount),
      discount: String(order.discount),
      notes: order.notes || "",
    });
    setLines(order.lines?.length
      ? order.lines.map((line) => ({
          localId: line.id,
          productId: line.productId || "",
          productName: line.productName,
          quantity: String(line.quantity),
          unitPrice: String(line.unitPrice),
          discountPercent: String(line.discountPercent),
        }))
      : [emptyLine()]);
    setShowCreate(true);
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const validLines = lines
      .map((line) => ({
        id: line.localId.startsWith("ol-") ? line.localId : undefined,
        productId: line.productId || undefined,
        productName: line.productName.trim(),
        quantity: Number(line.quantity) || 1,
        unitPrice: Number(line.unitPrice) || 0,
        discountPercent: Number(line.discountPercent) || 0,
      }))
      .filter((line) => line.productName && line.unitPrice > 0 && line.quantity > 0);

    try {
      const payload = {
        clientName: form.clientName,
        amount: validLines.length > 0 ? undefined : Number(form.amount),
        discount: Number(form.discount),
        notes: form.notes,
        lines: validLines,
      };
      if (editingOrder) {
        await patchJson(`/api/v1/orders/${editingOrder.id}`, payload);
        toast.success("Commande mise a jour");
      } else {
        await postJson("/api/v1/orders", payload);
        toast.success("Commande creee");
      }
      setShowCreate(false);
      resetCreateForm();
      await loadOrders();
    } finally {
      setSaving(false);
    }
  };

  const deleteOrder = async (order: Order) => {
    const decision = await confirm({
      title: `Supprimer ${order.id} ?`,
      description: "La commande et ses lignes seront supprimees definitivement.",
      confirmLabel: "Supprimer",
      tone: "danger",
    });
    if (!decision.confirmed) return;
    await requestJson(`/api/v1/orders/${order.id}`, { method: "DELETE" });
    toast.success("Commande supprimee");
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
    <div className="mx-auto max-w-[1440px] space-y-6 p-4 md:p-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm text-secondary">Commandes, lignes produit et validations</p>
          <h1 className="mt-1 text-3xl font-black text-on-surface">Flux de commandes</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() =>
              downloadCsv(
                "commandes",
                buildCsv(filteredOrders, [
                  { label: "ID", value: (o) => o.id },
                  { label: "Date", value: (o) => o.date },
                  { label: "Client", value: (o) => o.clientName },
                  { label: "Propriétaire", value: (o) => o.ownerName },
                  { label: "Territoire", value: (o) => o.territoryLabel },
                  { label: "Montant", value: (o) => o.amount },
                  { label: "Remise %", value: (o) => o.discount },
                  { label: "Statut", value: (o) => o.status },
                  { label: "Validation", value: (o) => o.approvalStatus },
                  { label: "Sync", value: (o) => o.syncStatus },
                ]),
              )
            }
          >
            <Download className="h-4 w-4" />
            Exporter CSV
          </Button>
          {can("orders.write") ? (
            <Button className="self-start gap-2" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Nouvelle commande
            </Button>
          ) : null}
        </div>
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
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
              filter === item.key
                ? "border-primary bg-primary text-on-primary"
                : "border-outline-variant bg-surface text-secondary hover:bg-surface-container"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <SkeletonGrid count={6} />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          title="Aucune commande enregistree"
          description="Les flux de commande, validations et synchronisations apparaitront ici des la premiere saisie."
          action={
            can("orders.write") ? (
              <Button className="gap-2" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Nouvelle commande
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {filteredOrders.map((order) => (
            <div
              key={order.id}
              className="space-y-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-black text-on-surface">{order.id}</p>
                  <p className="mt-1 text-sm text-secondary">{order.clientName}</p>
                </div>
                <Badge variant={orderStatusTone(order.status)}>{orderStatusLabel[order.status]}</Badge>
              </div>
              <div className="space-y-2 text-sm text-secondary">
                <div className="flex justify-between">
                  <span>Montant</span>
                  <span className="font-bold text-on-surface">
                    {formatCurrency(order.amount, company.currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Remise validation</span>
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
              {order.lines?.length ? (
                <div className="rounded-xl border border-outline-variant bg-surface p-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-secondary">Lignes</p>
                  <div className="space-y-1">
                    {order.lines.map((line) => (
                      <div key={line.id} className="flex justify-between gap-3 text-xs text-secondary">
                        <span className="truncate">
                          {line.quantity} x {line.productName}
                        </span>
                        <span className="font-semibold text-on-surface">
                          {formatCurrency(line.lineTotal, company.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Badge variant={approvalTone(order.approvalStatus)}>
                  {approvalStatusLabel[order.approvalStatus]}
                </Badge>
                <Badge variant="neutral">{syncStatusLabel[order.syncStatus]}</Badge>
              </div>
              <p className="min-h-10 text-xs text-secondary">{order.notes || "Aucune note."}</p>
              {can("orders.approve") && order.approvalStatus === "pending" ? (
                <Button
                  variant="outline"
                  className="w-full justify-center"
                  onClick={() => void handleApprove(order)}
                >
                  <CircleCheckBig className="mr-2 h-4 w-4" />
                  Approuver et confirmer
                </Button>
              ) : null}
              {can("orders.write") && (order.status === "draft" || order.status === "awaiting_approval") ? (
                <Button variant="outline" className="w-full" onClick={() => openEdit(order)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Modifier le brouillon
                </Button>
              ) : null}
              {can("orders.delete") && (order.status === "draft" || order.status === "cancelled") ? (
                <Button variant="ghost" className="w-full text-error" onClick={() => void deleteOrder(order)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Supprimer
                </Button>
              ) : null}
              <a
                href={`/api/v1/orders/${order.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-outline-variant bg-white px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
              >
                Telecharger PDF
              </a>
            </div>
          ))}
        </div>
      )}

      {showCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form
            onSubmit={(event) => void handleCreate(event)}
            className="max-h-[92vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-3xl border border-outline-variant bg-surface-container-lowest p-6 shadow-xl"
          >
            <div>
              <p className="text-sm font-bold text-on-surface">
                {editingOrder ? `Modifier ${editingOrder.id}` : "Nouvelle commande"}
              </p>
              <p className="mt-1 text-xs text-secondary">
                Les lignes produit alimentent le montant, les validations et le PDF.
              </p>
            </div>
            <input
              className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
              placeholder="Client"
              value={form.clientName}
              onChange={(event) => setForm({ ...form, clientName: event.target.value })}
              required
            />

            <div className="rounded-2xl border border-outline-variant bg-surface p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-on-surface">Articles</p>
                  <p className="text-xs text-secondary">Selectionnez un produit ou saisissez une ligne libre.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, emptyLine()])}>
                  <PackagePlus className="mr-1 h-3.5 w-3.5" />
                  Ajouter
                </Button>
              </div>
              <div className="space-y-3">
                {lines.map((line) => (
                  <div key={line.localId} className="grid gap-2 rounded-xl border border-outline-variant bg-white p-3 md:grid-cols-[1.2fr_1.2fr_0.7fr_0.8fr_0.7fr_auto]">
                    <select
                      className="rounded-lg border border-outline-variant bg-surface px-3 py-2 text-xs"
                      value={line.productId}
                      onChange={(event) => updateLine(line.localId, { productId: event.target.value })}
                    >
                      <option value="">Ligne libre</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.ref} - {product.name}
                        </option>
                      ))}
                    </select>
                    <input
                      className="rounded-lg border border-outline-variant bg-surface px-3 py-2 text-xs"
                      placeholder="Libelle"
                      value={line.productName}
                      onChange={(event) => updateLine(line.localId, { productName: event.target.value })}
                    />
                    <input
                      className="rounded-lg border border-outline-variant bg-surface px-3 py-2 text-xs"
                      type="number"
                      min="0.001"
                      step="0.001"
                      placeholder="Qte"
                      value={line.quantity}
                      onChange={(event) => updateLine(line.localId, { quantity: event.target.value })}
                    />
                    <input
                      className="rounded-lg border border-outline-variant bg-surface px-3 py-2 text-xs"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Prix"
                      value={line.unitPrice}
                      onChange={(event) => updateLine(line.localId, { unitPrice: event.target.value })}
                    />
                    <input
                      className="rounded-lg border border-outline-variant bg-surface px-3 py-2 text-xs"
                      type="number"
                      min="0"
                      max="100"
                      placeholder="Remise %"
                      value={line.discountPercent}
                      onChange={(event) => updateLine(line.localId, { discountPercent: event.target.value })}
                    />
                    <button
                      type="button"
                      className="flex items-center justify-center rounded-lg border border-outline-variant px-3 text-secondary hover:bg-surface"
                      onClick={() => setLines((current) => current.length === 1 ? [emptyLine()] : current.filter((entry) => entry.localId !== line.localId))}
                      title="Supprimer la ligne"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <div className="text-right text-xs font-bold text-on-surface md:col-span-6">
                      Total ligne: {formatCurrency(lineTotal(line), company.currency)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-end text-sm font-black text-on-surface">
                Total articles: {formatCurrency(computedTotal, company.currency)}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                type="number"
                placeholder="Montant manuel si aucune ligne"
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                type="number"
                min="0"
                max="100"
                placeholder="Remise validation %"
                value={form.discount}
                onChange={(event) => setForm({ ...form, discount: event.target.value })}
              />
            </div>
            <textarea
              className="min-h-28 w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
              placeholder="Notes"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCreate(false);
                  resetCreateForm();
                }}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Enregistrement..." : editingOrder ? "Mettre a jour" : "Enregistrer"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
