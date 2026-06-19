import { useCallback, useEffect, useState } from "react";
import { Send, Trash2 } from "lucide-react";
import { asArray, getJson, postJson, requestJson } from "../lib/api";
import { Button } from "./ui";
import { useWorkspace } from "../context/WorkspaceContext";
import type { CommentEntityType, CommentItem } from "../types";

export function CommentsThread({
  entityType,
  entityId,
}: {
  entityType: CommentEntityType;
  entityId: string;
}) {
  const { currentUser } = useWorkspace();
  const [items, setItems] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getJson<unknown>(
        `/api/v1/comments?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`,
      );
      setItems(asArray<CommentItem>(data));
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      await postJson(`/api/v1/comments`, { entityType, entityId, body });
      setDraft("");
      await load();
    } finally {
      setPosting(false);
    }
  };

  const remove = async (id: string) => {
    await requestJson(`/api/v1/comments/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
        <textarea
          rows={3}
          placeholder="Ajouter un commentaire interne (visible par l'équipe)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full resize-none rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={() => void submit()} disabled={!draft.trim() || posting}>
            <Send className="mr-1 h-3.5 w-3.5" /> Publier
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        {loading ? (
          <p className="text-sm text-secondary">Chargement…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-secondary">Aucun commentaire.</p>
        ) : (
          items.map((c) => (
            <div key={c.id} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-carbon">
                    {c.authorInitials || "?"}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-on-surface">{c.authorName || "Inconnu"}</p>
                    <p className="text-[10px] text-secondary">
                      {new Date(c.createdAt).toLocaleString("fr-FR")}
                    </p>
                  </div>
                </div>
                {(c.authorUserId === currentUser?.id) ? (
                  <button
                    onClick={() => void remove(c.id)}
                    className="text-secondary hover:text-error"
                    title="Supprimer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              <p className="whitespace-pre-wrap text-sm text-on-surface">{c.body}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
