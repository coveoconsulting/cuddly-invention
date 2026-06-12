import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Package2, RefreshCcw, Search } from "lucide-react";
import type { Product } from "../types";
import { getJson, patchJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { formatCurrency } from "../lib/labels";
import { useWorkspace } from "../context/WorkspaceContext";

export function ProductsView() {
  const { company, can } = useWorkspace();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [stockValue, setStockValue] = useState("");

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      const payload = await getJson<Product[]>("/api/v1/products");
      setProducts(payload);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const filtered = useMemo(() => {
    return products.filter((product) =>
      `${product.name} ${product.ref} ${product.category}`.toLowerCase().includes(query.toLowerCase()),
    );
  }, [products, query]);

  const handleSaveStock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) {
      return;
    }
    await patchJson(`/api/v1/products/${editing.id}/stock`, { stock: Number(stockValue) });
    setEditing(null);
    setStockValue("");
    await loadProducts();
  };

  if (!company) {
    return null;
  }

  return (
    <div className="p-4 md:p-6 max-w-[1440px] mx-auto space-y-6">
      <div>
        <p className="text-sm text-secondary">Catalogue et disponibilite</p>
        <h1 className="text-3xl font-black text-on-surface mt-1">Produits et stocks</h1>
      </div>

      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 w-4 h-4 text-secondary" />
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
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-10 text-center text-secondary">
          Chargement du catalogue...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {filtered.map((product) => {
            const lowStock = product.stock <= 10;
            const outOfStock = product.stock === 0;
            return (
              <div key={product.id} className="rounded-2xl border border-outline-variant bg-surface-container-lowest overflow-hidden shadow-sm">
                <div className="h-44 bg-surface">
                  {product.image ? (
                    <img src={product.image} alt={product.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-secondary">
                      <Package2 className="w-10 h-10" />
                    </div>
                  )}
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-secondary">{product.ref}</p>
                    <h2 className="mt-1 text-base font-bold text-on-surface">{product.name}</h2>
                    <p className="mt-1 text-sm text-secondary">{product.description}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-secondary">Prix</p>
                      <p className="text-lg font-black text-on-surface">{formatCurrency(product.price, company.currency)}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant={outOfStock ? "error" : lowStock ? "warning" : "success"}>
                        {product.stock} unites
                      </Badge>
                      <p className="mt-1 text-xs text-secondary">{product.category}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    {outOfStock || lowStock ? (
                      <div className="text-xs text-secondary flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        {outOfStock ? "Rupture" : "Stock faible"}
                      </div>
                    ) : (
                      <div className="text-xs text-secondary">Stock sain</div>
                    )}
                    {can("products.write") ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditing(product);
                          setStockValue(String(product.stock));
                        }}
                      >
                        <RefreshCcw className="w-3.5 h-3.5 mr-1" />
                        Ajuster
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing ? (
        <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveStock} className="w-full max-w-sm rounded-3xl border border-outline-variant bg-surface-container-lowest p-6 shadow-xl space-y-4">
            <div>
              <p className="text-sm font-bold text-on-surface">Ajuster le stock</p>
              <p className="text-xs text-secondary mt-1">{editing.name}</p>
            </div>
            <input
              type="number"
              min="0"
              value={stockValue}
              onChange={(event) => setStockValue(event.target.value)}
              className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
              required
            />
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Annuler</Button>
              <Button type="submit">Mettre a jour</Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
