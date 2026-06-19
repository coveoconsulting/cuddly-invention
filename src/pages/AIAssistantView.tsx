import { useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit, MessageSquarePlus, Send, Sparkles, Trash2 } from "lucide-react";
import { Button } from "../components/ui";
import { postJson } from "../lib/api";
import type { AssistantResponse } from "../types";
import { useWorkspace } from "../context/WorkspaceContext";

type ChatMessage = {
  role: "user" | "copilot";
  text: string;
  ts: string;
};

type Thread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

const STORAGE_KEY_PREFIX = "clerivo:ai-threads:";

function loadThreads(userId: string): Thread[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + userId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Thread[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveThreads(userId: string, threads: Thread[]) {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + userId, JSON.stringify(threads));
  } catch {
    /* quota — best effort */
  }
}

function newThread(welcomeText: string): Thread {
  const id = (globalThis.crypto?.randomUUID?.() ?? `t-${Date.now()}`);
  const now = new Date().toISOString();
  return {
    id,
    title: "Nouvelle conversation",
    createdAt: now,
    updatedAt: now,
    messages: [{ role: "copilot", text: welcomeText, ts: now }],
  };
}

export function AIAssistantView() {
  const { company, currentUser } = useWorkspace();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const welcome = useMemo(() => {
    if (!company || !currentUser) return "";
    return `Bonjour ${currentUser.name}. Je travaille sur les données réelles de ${company.name}. Je peux vous aider à prioriser le pipeline, préparer les visites, analyser les commandes et identifier les urgences commerciales.`;
  }, [company?.id, currentUser?.id]);

  useEffect(() => {
    if (!currentUser) return;
    const stored = loadThreads(currentUser.id);
    if (stored.length === 0) {
      const fresh = newThread(welcome);
      setThreads([fresh]);
      setActiveId(fresh.id);
      saveThreads(currentUser.id, [fresh]);
    } else {
      setThreads(stored);
      setActiveId(stored[0].id);
    }
  }, [currentUser?.id, welcome]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeId, isLoading]);

  const active = useMemo(
    () => threads.find((thread) => thread.id === activeId) ?? null,
    [threads, activeId],
  );

  const persist = (next: Thread[]) => {
    setThreads(next);
    if (currentUser) saveThreads(currentUser.id, next);
  };

  const createThread = () => {
    const fresh = newThread(welcome);
    persist([fresh, ...threads]);
    setActiveId(fresh.id);
  };

  const deleteThread = (id: string) => {
    const next = threads.filter((thread) => thread.id !== id);
    persist(next);
    if (activeId === id) {
      setActiveId(next[0]?.id ?? null);
    }
  };

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !active) return;
    const now = new Date().toISOString();
    const userMsg: ChatMessage = { role: "user", text: trimmed, ts: now };
    const updatedThread: Thread = {
      ...active,
      messages: [...active.messages, userMsg],
      title:
        active.messages.filter((m) => m.role === "user").length === 0
          ? trimmed.slice(0, 50)
          : active.title,
      updatedAt: now,
    };
    persist(threads.map((thread) => (thread.id === active.id ? updatedThread : thread)));
    setInput("");
    setIsLoading(true);
    try {
      const response = await postJson<AssistantResponse>("/api/v1/ai/chat", {
        message: trimmed,
        history: active.messages,
      });
      const replyTs = new Date().toISOString();
      const reply: ChatMessage = { role: "copilot", text: response.text, ts: replyTs };
      persist(
        threads.map((thread) =>
          thread.id === active.id
            ? {
                ...updatedThread,
                messages: [...updatedThread.messages, reply],
                updatedAt: replyTs,
              }
            : thread,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const suggestions = [
    "Quelles sont mes priorités commerciales aujourd'hui ?",
    "Prépare la prochaine tournée avec les comptes les plus urgents.",
    "Repère les commandes qui bloquent l'exécution terrain.",
    "Analyse les opportunités qui doivent être relancées rapidement.",
  ];

  if (!company || !currentUser) {
    return null;
  }

  return (
    <div className="mx-auto grid h-[calc(100vh-120px)] max-w-[1320px] grid-cols-1 gap-4 p-4 md:p-6 xl:grid-cols-[280px_1fr_280px]">
      <aside className="hidden flex-col overflow-hidden rounded-3xl border border-outline-variant bg-surface-container-lowest shadow-sm xl:flex">
        <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
          <p className="text-sm font-bold text-on-surface">Conversations</p>
          <button
            type="button"
            onClick={createThread}
            className="inline-flex items-center gap-1 rounded-lg border border-outline-variant bg-white px-2 py-1 text-xs font-semibold text-on-surface hover:bg-surface"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            Nouveau
          </button>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {threads.length === 0 ? (
            <p className="px-2 py-3 text-xs text-secondary">Aucune conversation.</p>
          ) : (
            threads.map((thread) => (
              <div
                key={thread.id}
                className={`group flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                  activeId === thread.id
                    ? "bg-primary/10 text-on-surface"
                    : "hover:bg-surface text-secondary"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveId(thread.id)}
                  className="flex-1 min-w-0 text-left"
                >
                  <p className="truncate text-xs font-semibold">{thread.title}</p>
                  <p className="truncate text-[10px] text-secondary">
                    {new Date(thread.updatedAt).toLocaleString("fr-FR")}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => deleteThread(thread.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Supprimer"
                >
                  <Trash2 className="h-3.5 w-3.5 text-secondary hover:text-error" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      <div className="flex flex-col overflow-hidden rounded-3xl border border-outline-variant bg-surface-container-lowest shadow-sm">
        <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold text-on-surface truncate">{active?.title ?? "Assistant IA"}</p>
              <p className="text-xs text-secondary">Contexte session, portefeuille et alertes réelles</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={createThread}
              className="inline-flex items-center gap-1 rounded-lg border border-outline-variant bg-white px-2 py-1 text-xs font-semibold text-on-surface hover:bg-surface xl:hidden"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              Nouveau
            </button>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              {currentUser.roleLabel}
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-surface p-5">
          {active?.messages.map((message, index) => {
            const isUser = message.role === "user";
            return (
              <div key={`${message.role}-${index}`} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                    isUser
                      ? "rounded-br-md bg-primary text-on-primary"
                      : "rounded-bl-md border border-outline-variant bg-surface-container-lowest text-on-surface"
                  }`}
                >
                  {message.text}
                </div>
              </div>
            );
          })}
          {isLoading ? (
            <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm text-secondary shadow-sm">
              Analyse en cours...
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSend(input);
          }}
          className="border-t border-outline-variant bg-surface-container-lowest p-4"
        >
          <div className="flex items-center gap-2 rounded-2xl border border-outline-variant bg-surface px-2 py-2">
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className="flex-1 bg-transparent px-3 py-2 text-sm focus:outline-none"
              placeholder="Demandez une analyse commerciale ou opérationnelle"
              disabled={isLoading || !active}
            />
            <Button type="submit" size="sm" disabled={isLoading || !input.trim() || !active}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>

      <div className="space-y-4 overflow-y-auto rounded-3xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
        <div>
          <p className="text-sm font-bold text-on-surface">Requêtes rapides</p>
          <p className="mt-1 text-xs text-secondary">Basées sur les données disponibles côté serveur.</p>
        </div>
        <div className="space-y-3">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => void handleSend(suggestion)}
              className="w-full rounded-2xl border border-outline-variant bg-surface p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <p className="text-sm font-semibold text-on-surface">{suggestion}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
