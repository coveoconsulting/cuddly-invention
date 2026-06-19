import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Package2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { Product } from "../types";
import { ApiError, asArray, getJson, patchJson, postJson, requestJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { EmptyState } from "../components/EmptyState";
import { SkeletonCard } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/Dialog";
import { formatCurrency } from "../lib/labels";
import { useWorkspace } from "../context/WorkspaceContext";

type ProductForm = {
  name: string;
  ref: string;
  category: string;
  price: string;
  stock: string;
  status: Product["status"];
  image: string;
  description: string;
};

const emptyForm: ProductForm = {
  name: "",
  ref: "",
  category: "",
  price: "",
  stock: "0",
  status: "active",
  image: "",
  description: "",
};

function formFromProduct(product: Product): ProductForm {
  return {
    name: product.name,
    ref: product.ref,
    category: product.category,
    price: String(product.price),
    stock: String(product.stock),
    status: product.status,
    image: product.image || "",
    description: product.description || "",
  };
}

export function ProductsView() {
  const { company, can } = useWorkspace();
  const toast = useToast();
  const confirm = useConfirm();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const removeProduct = async (product: Product) => {
    if (busyId) return;
    const decision = await confirm({
      title: `Supprimer ${product.name} ?`,
      description: `Référence ${product.ref}. La référence ne pourra plus être utilisée dans de nouvelles commandes.`,
      confirmLabel: "Supprimer",
      tone: "danger",
    });
    if (!decision.confirmed) return;
    setBusyId(product.id);
    setProducts((current) => current.filter((entry) => entry.id !== product.id));
    try {
      await requestJson(`/api/v1/products/${product.id}`, { method: "DELETE" });
      toast.success(`${product.name} supprimé`);
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "Suppression impossible");
      await loadProducts();
    } finally {
      setBusyId(null);
    }
  };

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      const payload = await getJson<unknown>("/api/v1/products");
      setProducts(asArray<Product>(payload));
      setError("");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Chargement impossible");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.toLowerCase();
    return products.filter((product) =>
      `${product.name} ${product.ref} ${product.category}`.toLowerCase().includes(needle),
    );
  }, [products, query]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
    setError("");
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    setForm(formFromProduct(product));
    setShowForm(true);
    setError("");
  };

  const handleSaveProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const payload = {
      name: form.name.trim(),
      ref: form.ref.trim(),
      category: form.category.trim(),
      price: Number(form.price) || 0,
      stock: Number(form.stock) || 0,
      status: form.status,
      image: form.image.trim(),
      description: form.description.trim(),
    };
    try {
      if (editing) {
        await patchJson(`/api/v1/products/${editing.id}`, payload);
        toast.success(`${payload.name} mis à jour`);
      } else {
        await postJson("/api/v1/products", payload);
        toast.success(`${payload.name} créé`);
      }
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
      await loadProducts();
    } catch (reason) {
      const message = reason instanceof ApiError ? reason.message : "Enregistrement impossible";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (!company) {
    return null;
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 p-4 md:p-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm text-secondary">Catalogue, prix et disponibilite</p>
          <h1 className="mt-1 text-3xl font-black text-on-surface">Produits et stocks</h1>
        </div>
        {can("products.write") ? (
          <Button className="self-start gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nouveau produit
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-error/30 bg-error-container px-3 py-2 text-xs text-error">
          {error}
        </div>
      ) : null}

      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-secondary" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-xl border border-outline-variant bg-surface px-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Rechercher par produit, reference ou categorie"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Aucun produit au catalogue"
          description="Ajoutez des references pour suivre le stock, les disponibilites et les alertes de rupture."
          action={can("products.write") ? <Button onClick={openCreate}>Ajouter un produit</Button> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {filtered.map((product) => {
            const lowStock = product.stock <= 10;
            const outOfStock = product.stock === 0;

            return (
              <div
                key={product.id}
                className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm"
              >
                <div className="h-44 bg-surface">
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.name}
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-secondary">
                      <Package2 className="h-10 w-10" />
                    </div>
                  )}
                </div>
                <div className="space-y-4 p-4">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold uppercase tracking-wider text-secondary">{product.ref}</p>
                      <Badge variant={product.status === "active" ? "success" : "neutral"}>
                        {product.status === "active" ? "Actif" : "Inactif"}
                      </Badge>
                    </div>
                    <h2 className="mt-1 text-base font-bold text-on-surface">{product.name}</h2>
                    <p className="mt-1 line-clamp-2 text-sm text-secondary">{product.description}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-secondary">Prix</p>
                      <p className="text-lg font-black text-on-surface">
                        {formatCurrency(product.price, company.currency)}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge variant={outOfStock ? "error" : lowStock ? "warning" : "success"}>
                        {product.stock} unites
                      </Badge>
                      <p className="mt-1 text-xs text-secondary">{product.category || "Sans categorie"}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    {outOfStock || lowStock ? (
                      <div className="flex items-center gap-1.5 text-xs text-secondary">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                        {outOfStock ? "Rupture" : "Stock faible"}
                      </div>
                    ) : (
                      <div className="text-xs text-secondary">Stock sain</div>
                    )}
                    <div className="flex items-center gap-1">
                      {can("products.delete") ? (
                        <button
                          type="button"
                          onClick={() => void removeProduct(product)}
                          disabled={busyId === product.id}
                          title="Supprimer"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant bg-white text-secondary transition-colors hover:border-error/30 hover:bg-error-container hover:text-error disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      {can("products.write") ? (
                        <Button variant="outline" size="sm" onClick={() => openEdit(product)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          Modifier
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form
            onSubmit={(event) => void handleSaveProduct(event)}
            className="w-full max-w-2xl space-y-4 rounded-3xl border border-outline-variant bg-surface-container-lowest p-6 shadow-xl"
          >
            <div>
              <p className="text-sm font-bold text-on-surface">
                {editing ? "Modifier le produit" : "Nouveau produit"}
              </p>
              <p className="mt-1 text-xs text-secondary">
                Catalogue persiste en Postgres et reutilisable dans les commandes.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                placeholder="Nom du produit"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                placeholder="Reference"
                value={form.ref}
                onChange={(event) => setForm({ ...form, ref: event.target.value })}
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                placeholder="Categorie"
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
              />
              <select
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value as Product["status"] })}
              >
                <option value="active">Actif</option>
                <option value="inactive">Inactif</option>
              </select>
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                type="number"
                min="0"
                step="0.01"
                placeholder="Prix"
                value={form.price}
                onChange={(event) => setForm({ ...form, price: event.target.value })}
                required
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                type="number"
                min="0"
                placeholder="Stock"
                value={form.stock}
                onChange={(event) => setForm({ ...form, stock: event.target.value })}
                required
              />
            </div>
            <input
              className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
              placeholder="URL image"
              value={form.image}
              onChange={(event) => setForm({ ...form, image: event.target.value })}
            />
            <textarea
              className="min-h-24 w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
              placeholder="Description"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Annuler
              </Button>
              <Button type="submit" loading={saving}>
                Enregistrer
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
