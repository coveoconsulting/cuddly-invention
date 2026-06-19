import { useEffect, useState } from "react";
import { Download, FileText, Upload } from "lucide-react";
import type { Client, DocumentItem } from "../types";
import { ApiError, asArray, getJson, postJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { formatDateTime } from "../lib/labels";

export function DocumentsView() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", blobUrl: "", clientId: "" });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setIsLoading(true);
    try {
      const [docsPayload, clientsPayload] = await Promise.all([
        getJson<unknown>("/api/v1/documents"),
        getJson<unknown>("/api/v1/clients"),
      ]);
      setDocuments(asArray<DocumentItem>(docsPayload));
      setClients(asArray<Client>(clientsPayload));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const resetForm = () => {
    setShowAdd(false);
    setForm({ name: "", blobUrl: "", clientId: "" });
    setFile(null);
    setError("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setUploading(true);
    try {
      if (file) {
        const response = await fetch("/api/v1/documents/upload", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "X-Filename": file.name,
            "X-Document-Name": form.name || file.name,
            ...(form.clientId ? { "X-Client-Id": form.clientId } : {}),
          },
          body: file,
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new ApiError((payload as { error?: string }).error || "Upload impossible", response.status, payload);
        }
      } else {
        await postJson("/api/v1/documents", {
          name: form.name,
          blobUrl: form.blobUrl,
          clientId: form.clientId || undefined,
        });
      }
      resetForm();
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Ajout impossible");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm text-secondary">Pièces jointes</p>
          <h1 className="mt-1 text-3xl font-black text-on-surface">Documents</h1>
          <p className="mt-1 text-sm text-secondary">Contrats, devis et justificatifs liés aux comptes.</p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <FileText className="mr-2 h-4 w-4" />
          Ajouter un document
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 text-secondary">
          Chargement...
        </div>
      ) : documents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container-lowest p-10 text-center text-secondary">
          Aucun document lié pour l'instant.
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
              <FileText className="h-5 w-5 shrink-0 text-secondary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-on-surface">{doc.name}</p>
                <p className="text-[11px] text-secondary">
                  Par {doc.uploadedByName} · {formatDateTime(doc.createdAt)}
                  {doc.sizeBytes > 0 ? ` · ${(doc.sizeBytes / 1024).toFixed(1)} KB` : ""}
                </p>
              </div>
              {doc.signedAt ? <Badge variant="success">Signé</Badge> : null}
              <a
                href={doc.blobUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-outline-variant bg-white px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface"
              >
                <Download className="h-3.5 w-3.5" />
                Ouvrir
              </a>
            </div>
          ))}
        </div>
      )}

      {showAdd ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form onSubmit={submit} className="w-full max-w-md space-y-3 rounded-2xl border border-outline-variant bg-white p-6 shadow-2xl">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-secondary">Nouveau document</p>
              <h3 className="mt-1 text-xl font-black text-on-surface">Ajouter un fichier</h3>
            </div>
            <input
              className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
              placeholder="Nom du document"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required={!file}
            />
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-outline-variant bg-surface px-4 py-3 text-sm text-secondary hover:bg-surface-container">
              <Upload className="h-4 w-4" />
              <span className="truncate">{file ? file.name : "Téléverser un fichier"}</span>
              <input type="file" className="hidden" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </label>
            <input
              className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm disabled:opacity-50"
              placeholder="Ou URL externe (https://...)"
              type="url"
              value={form.blobUrl}
              onChange={(event) => setForm({ ...form, blobUrl: event.target.value })}
              required={!file}
              disabled={Boolean(file)}
            />
            <select className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" value={form.clientId} onChange={(event) => setForm({ ...form, clientId: event.target.value })}>
              <option value="">Aucun client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
            {error ? <p className="text-xs text-error">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={resetForm}>Annuler</Button>
              <Button type="submit" disabled={uploading}>{uploading ? "Envoi..." : "Ajouter"}</Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
