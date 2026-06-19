import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCheck,
  FileText,
  Image as ImageIcon,
  MessageCircle,
  Paperclip,
  Phone,
  Plus,
  Search,
  Send,
  Settings as SettingsIcon,
  X,
} from "lucide-react";
import { asArray, getJson, patchJson, postJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import type {
  WhatsAppContact,
  WhatsAppMessage,
  WhatsAppSettings,
  WhatsAppStatus,
} from "../types";
import { cn } from "../lib/utils";

const API = "/api/v1/whatsapp";

function formatTimestamp(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function StatusIcon({ status }: { status: WhatsAppStatus }) {
  if (status === "failed") return <X className="h-3.5 w-3.5 text-red-500" />;
  if (status === "read") return <CheckCheck className="h-3.5 w-3.5 text-sky-400" />;
  if (status === "delivered") return <CheckCheck className="h-3.5 w-3.5 text-white/70" />;
  if (status === "sent") return <Check className="h-3.5 w-3.5 text-white/70" />;
  return <span className="text-[10px] text-white/60">…</span>;
}

function lastMessagePreview(c: WhatsAppContact) {
  if (c.lastType === "image") return "📷 Photo";
  if (c.lastType === "document") return "📄 Document";
  if (c.lastType === "audio") return "🎤 Audio";
  if (c.lastType === "video") return "🎬 Vidéo";
  if (c.lastType === "template") return "📋 " + c.lastBody;
  if (c.lastType === "location") return "📍 Localisation";
  return c.lastBody || "";
}

function mediaTypeForFile(file: File): "image" | "document" | "audio" | "video" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  return "document";
}

export function WhatsAppView() {
  const [contacts, setContacts] = useState<WhatsAppContact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<WhatsAppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadContacts = useCallback(async () => {
    setLoadingContacts(true);
    try {
      const data = await getJson<unknown>(`${API}/contacts`);
      setContacts(asArray<WhatsAppContact>(data));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  const loadMessages = useCallback(async (contactId: string) => {
    setLoadingMessages(true);
    try {
      const data = await getJson<unknown>(`${API}/contacts/${contactId}/messages`);
      setMessages(asArray<WhatsAppMessage>(data));
      await postJson(`${API}/contacts/${contactId}/read`);
      setContacts((prev) =>
        prev.map((c) => (c.id === contactId ? { ...c, unreadCount: 0 } : c)),
      );
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => { void loadContacts(); }, [loadContacts]);

  useEffect(() => {
    if (!selectedId) return;
    void loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // SSE — live messages + status updates
  useEffect(() => {
    const es = new EventSource(`${API}/stream`, { withCredentials: true });
    es.addEventListener("message", (evt) => {
      try {
        const msg = JSON.parse((evt as MessageEvent).data) as WhatsAppMessage;
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          if (msg.contactId === selectedIdRef.current) return [...prev, msg];
          return prev;
        });
        setContacts((prev) => {
          const found = prev.find((c) => c.id === msg.contactId);
          if (!found) {
            void loadContacts();
            return prev;
          }
          const updated: WhatsAppContact = {
            ...found,
            lastMessageAt: msg.createdAt,
            lastBody: msg.body,
            lastType: msg.type,
            unreadCount:
              msg.direction === "inbound" && msg.contactId !== selectedIdRef.current
                ? found.unreadCount + 1
                : found.unreadCount,
          };
          const others = prev.filter((c) => c.id !== msg.contactId);
          return [updated, ...others];
        });
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("status", (evt) => {
      try {
        const { waMessageId, status, errorMessage } = JSON.parse((evt as MessageEvent).data);
        setMessages((prev) =>
          prev.map((m) =>
            m.waMessageId === waMessageId ? { ...m, status, errorMessage } : m,
          ),
        );
      } catch {
        /* ignore */
      }
    });
    es.onerror = () => {
      // browser auto-reconnects
    };
    return () => es.close();
  }, [loadContacts]);

  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  const selected = useMemo(
    () => contacts.find((c) => c.id === selectedId) ?? null,
    [contacts, selectedId],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.linkedName ?? "").toLowerCase().includes(q),
    );
  }, [contacts, search]);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || !selected || sending) return;
    setSending(true);
    try {
      const msg = await postJson<WhatsAppMessage>(
        `${API}/contacts/${selected.id}/messages`,
        { text },
      );
      setMessages((prev) => [...prev, msg]);
      setDraft("");
      setContacts((prev) => {
        const found = prev.find((c) => c.id === selected.id);
        if (!found) return prev;
        const updated = { ...found, lastBody: text, lastType: "text" as const, lastMessageAt: msg.createdAt };
        return [updated, ...prev.filter((c) => c.id !== selected.id)];
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const sendAttachment = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file || !selected || attaching) return;
    setAttaching(true);
    try {
      const uploadResponse = await fetch(`/api/v1/uploads/blob?folder=whatsapp`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-Filename": file.name,
        },
        body: file,
      });
      const upload = await uploadResponse.json().catch(() => ({})) as {
        url?: string;
        name?: string;
        error?: string;
      };
      if (!uploadResponse.ok || !upload.url) {
        throw new Error(upload.error || "Upload impossible");
      }
      const caption = draft.trim();
      const msg = await postJson<WhatsAppMessage>(
        `${API}/contacts/${selected.id}/messages`,
        {
          mediaUrl: upload.url,
          mediaType: mediaTypeForFile(file),
          mediaFilename: upload.name || file.name,
          mediaCaption: caption || undefined,
        },
      );
      setMessages((prev) => [...prev, msg]);
      setDraft("");
      setContacts((prev) => {
        const found = prev.find((c) => c.id === selected.id);
        if (!found) return prev;
        const updated = {
          ...found,
          lastBody: caption || file.name,
          lastType: msg.type,
          lastMessageAt: msg.createdAt,
        };
        return [updated, ...prev.filter((c) => c.id !== selected.id)];
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAttaching(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const createContact = async () => {
    if (!newPhone.trim()) return;
    try {
      const c = await postJson<{ id: string }>(`${API}/contacts`, {
        phone: newPhone.trim(),
        displayName: newName.trim() || undefined,
      });
      setShowNew(false);
      setNewPhone("");
      setNewName("");
      await loadContacts();
      setSelectedId(c.id);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const openSettings = async () => {
    setShowSettings(true);
    try {
      const s = await getJson<WhatsAppSettings>(`${API}/settings`);
      setSettings(s);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="flex h-[calc(100vh-72px)] flex-col p-3 md:p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-secondary">Messagerie centralisée</p>
          <h1 className="text-2xl font-black text-on-surface">WhatsApp</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowNew(true)}>
            <Plus className="mr-1 h-4 w-4" /> Nouvelle conv.
          </Button>
          <Button variant="ghost" size="sm" onClick={openSettings}>
            <SettingsIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mb-2 rounded-lg border border-error/30 bg-error-container px-3 py-2 text-xs text-error">
          {error}
        </div>
      ) : null}

      <div className="flex flex-1 overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest">
        {/* contacts pane */}
        <aside className="flex w-[320px] shrink-0 flex-col border-r border-outline-variant">
          <div className="border-b border-outline-variant p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher une conversation"
                className="w-full rounded-full border border-outline-variant bg-surface px-9 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingContacts ? (
              <div className="p-4 text-sm text-secondary">Chargement…</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-sm text-secondary">
                Aucune conversation. Cliquez sur "Nouvelle conv." pour démarrer.
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-outline-variant/40 px-3 py-3 text-left transition-colors hover:bg-surface-container",
                    selectedId === c.id && "bg-primary/10",
                  )}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-carbon">
                    {(c.displayName || c.phone).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-on-surface">
                        {c.displayName || `+${c.phone}`}
                      </p>
                      <span className="shrink-0 text-[10px] text-secondary">
                        {formatTimestamp(c.lastMessageAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-secondary">{lastMessagePreview(c)}</p>
                      {c.unreadCount > 0 ? (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-carbon">
                          {c.unreadCount}
                        </span>
                      ) : null}
                    </div>
                    {c.linkedName ? (
                      <p className="mt-1 truncate text-[10px] text-secondary">
                        ↳ {c.linkedName}
                      </p>
                    ) : null}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* conversation pane */}
        <section className="flex flex-1 flex-col bg-[#efeae2]">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <MessageCircle className="mx-auto mb-3 h-10 w-10 text-secondary" />
                <p className="text-sm font-semibold text-on-surface">Sélectionnez une conversation</p>
                <p className="mt-1 text-xs text-secondary">
                  Choisissez un contact à gauche ou démarrez une nouvelle discussion.
                </p>
              </div>
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 py-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-carbon">
                  {(selected.displayName || selected.phone).slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-on-surface">
                    {selected.displayName || `+${selected.phone}`}
                  </p>
                  <p className="truncate text-[11px] text-secondary">
                    <Phone className="mr-1 inline h-3 w-3" />+{selected.phone}
                    {selected.linkedName ? <span className="ml-2">· {selected.linkedName}</span> : null}
                  </p>
                </div>
                {selected.clientId ? (
                  <Badge variant="success">Client lié</Badge>
                ) : selected.prospectId ? (
                  <Badge variant="default">Prospect</Badge>
                ) : (
                  <Badge variant="neutral">Non lié</Badge>
                )}
              </header>

              <div className="flex-1 overflow-y-auto px-4 py-4">
                {loadingMessages ? (
                  <div className="text-sm text-secondary">Chargement des messages…</div>
                ) : messages.length === 0 ? (
                  <div className="mt-10 text-center text-sm text-secondary">
                    Pas encore de message.
                  </div>
                ) : (
                  <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
                    {messages.map((m) => {
                      const mine = m.direction === "outbound";
                      return (
                        <div
                          key={m.id}
                          className={cn(
                            "flex max-w-[78%] flex-col rounded-xl px-3 py-2 text-sm shadow-sm",
                            mine
                              ? "self-end bg-[#005c4b] text-white"
                              : "self-start bg-white text-on-surface",
                          )}
                        >
                          {m.type === "image" && m.mediaUrl ? (
                            <a href={m.mediaUrl} target="_blank" rel="noreferrer">
                              <img
                                src={m.mediaUrl}
                                alt="image"
                                className="mb-1 max-h-72 rounded-md object-cover"
                              />
                            </a>
                          ) : null}
                          {m.type === "document" && m.mediaUrl ? (
                            <a
                              href={m.mediaUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mb-1 flex items-center gap-2 rounded-md bg-black/10 px-2 py-1.5 text-xs"
                            >
                              <FileText className="h-4 w-4" />
                              <span className="truncate">{m.mediaFilename || "document"}</span>
                            </a>
                          ) : null}
                          {m.type === "video" && m.mediaUrl ? (
                            <video controls src={m.mediaUrl} className="mb-1 max-h-72 rounded-md" />
                          ) : null}
                          {m.type === "audio" && m.mediaUrl ? (
                            <audio controls src={m.mediaUrl} className="mb-1 w-64 max-w-full" />
                          ) : null}
                          {m.type === "template" ? (
                            <span className="mb-1 inline-flex items-center gap-1 text-[10px] uppercase opacity-80">
                              <ImageIcon className="h-3 w-3" /> Template
                            </span>
                          ) : null}
                          {m.body ? (
                            <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          ) : null}
                          <div
                            className={cn(
                              "mt-1 flex items-center gap-1 self-end text-[10px]",
                              mine ? "text-white/70" : "text-secondary",
                            )}
                          >
                            <span>{formatTimestamp(m.createdAt)}</span>
                            {mine ? <StatusIcon status={m.status} /> : null}
                          </div>
                          {m.status === "failed" && m.errorMessage ? (
                            <p className="mt-1 text-[10px] text-red-300">{m.errorMessage}</p>
                          ) : null}
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              <footer className="border-t border-outline-variant bg-surface-container-lowest px-3 py-2">
                <div className="mx-auto flex max-w-3xl items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(event) => void sendAttachment(event)}
                  />
                  <button
                    type="button"
                    className="rounded-full p-2 text-secondary hover:bg-surface-container"
                    onClick={() => fileInputRef.current?.click()}
                    title="Joindre un fichier"
                    disabled={attaching}
                  >
                    <Paperclip className="h-5 w-5" />
                  </button>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendMessage();
                      }
                    }}
                    rows={1}
                    placeholder="Écrire un message…"
                    className="max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl border border-outline-variant bg-surface px-4 py-2 text-sm outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => void sendMessage()}
                    disabled={!draft.trim() || sending || attaching}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-[#005c4b] text-white disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>

      {/* New conversation dialog */}
      {showNew ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">Nouvelle conversation</h2>
              <button onClick={() => setShowNew(false)} className="text-secondary">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-secondary">
                  Numéro (avec indicatif, sans +)
                </label>
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="212661234567"
                  className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-secondary">
                  Nom (optionnel)
                </label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nom affiché"
                  className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <p className="text-[11px] text-secondary">
                Rappel Meta : sans interaction dans les 24h, vous devez utiliser un template approuvé.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowNew(false)}>
                  Annuler
                </Button>
                <Button size="sm" onClick={() => void createContact()}>
                  Créer
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Settings dialog */}
      {showSettings ? (
        <SettingsDialog
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={(s) => setSettings(s)}
        />
      ) : null}
    </div>
  );
}

function SettingsDialog({
  settings,
  onClose,
  onSaved,
}: {
  settings: WhatsAppSettings | null;
  onClose: () => void;
  onSaved: (s: WhatsAppSettings) => void;
}) {
  const [form, setForm] = useState({
    phoneNumberId: "",
    businessAccountId: "",
    displayPhoneNumber: "",
    verifyToken: "",
    defaultLanguage: "fr",
    accessToken: "",
    appSecret: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setForm((f) => ({
        ...f,
        phoneNumberId: settings.phoneNumberId,
        businessAccountId: settings.businessAccountId,
        displayPhoneNumber: settings.displayPhoneNumber,
        verifyToken: settings.verifyToken,
        defaultLanguage: settings.defaultLanguage,
      }));
    }
  }, [settings]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await patchJson<WhatsAppSettings>(`/api/v1/whatsapp/settings`, form);
      onSaved(updated);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-surface-container-lowest p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Configuration WhatsApp Cloud API</h2>
          <button onClick={onClose} className="text-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-[11px] text-secondary">
          Récupérez ces valeurs dans Meta Business → WhatsApp → Configuration de l'API.
          Webhook URL : <code>https://votre-domaine/api/whatsapp/webhook</code>
        </p>
        {error ? (
          <div className="mb-2 rounded-lg border border-error/30 bg-error-container px-3 py-2 text-xs text-error">
            {error}
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            ["phoneNumberId", "Phone Number ID"],
            ["businessAccountId", "Business Account ID"],
            ["displayPhoneNumber", "Numéro affiché"],
            ["verifyToken", "Verify Token (webhook)"],
            ["defaultLanguage", "Langue par défaut (fr, en…)"],
            ["accessToken", "Access Token (secret)"],
            ["appSecret", "App Secret (signature)"],
          ].map(([key, label]) => (
            <div key={key} className={key === "accessToken" || key === "appSecret" ? "sm:col-span-2" : undefined}>
              <label className="mb-1 block text-[11px] font-semibold text-secondary">{label}</label>
              <input
                type={key === "accessToken" || key === "appSecret" ? "password" : "text"}
                value={(form as Record<string, string>)[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={
                  key === "accessToken" && settings?.hasAccessToken
                    ? "(défini — laisser vide pour conserver)"
                    : key === "appSecret" && settings?.hasAppSecret
                      ? "(défini — laisser vide pour conserver)"
                      : ""
                }
                className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Annuler
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>
    </div>
  );
}
