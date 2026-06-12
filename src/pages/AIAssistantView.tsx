import { useEffect, useRef, useState } from "react";
import { BrainCircuit, Send, Sparkles } from "lucide-react";
import { Button } from "../components/ui";
import { postJson } from "../lib/api";
import type { AssistantResponse } from "../types";
import { useWorkspace } from "../context/WorkspaceContext";

type ChatMessage = {
  role: "user" | "copilot";
  text: string;
};

export function AIAssistantView() {
  const { company, currentUser } = useWorkspace();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (company && currentUser) {
      setMessages([
        {
          role: "copilot",
          text: `Bonjour ${currentUser.name}. Je suis branche sur les donnees reelles de ${company.name}. Je peux vous aider a prioriser le pipeline, lire les alertes stock, preparer une relance ou analyser les commandes en attente.`,
        },
      ]);
    }
  }, [company?.id, currentUser?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    const history = messages;
    setMessages((previous) => [...previous, { role: "user", text: trimmed }]);
    setInput("");
    setIsLoading(true);
    try {
      const response = await postJson<AssistantResponse>("/api/v1/ai/chat", {
        message: trimmed,
        history,
      });
      setMessages((previous) => [...previous, { role: "copilot", text: response.text }]);
    } finally {
      setIsLoading(false);
    }
  };

  const suggestions = [
    "Analyse mon pipeline et donne-moi les 3 actions prioritaires.",
    "Quelles commandes exigent une validation aujourd'hui ?",
    "Quels produits sont en stock critique sur mon perimetre ?",
    "Prepare-moi un plan de relance client pour les opportunites en retard.",
  ];

  if (!company || !currentUser) {
    return null;
  }

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 h-[calc(100vh-120px)]">
      <div className="rounded-3xl border border-outline-variant bg-surface-container-lowest shadow-sm flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-outline-variant flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div>
              <p className="text-base font-bold text-on-surface">Assistant IA</p>
              <p className="text-xs text-secondary">Contexte session, portefeuille et alertes reelles</p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="w-3.5 h-3.5" />
            {currentUser.roleLabel}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-surface">
          {messages.map((message, index) => {
            const isUser = message.role === "user";
            return (
              <div key={`${message.role}-${index}`} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                  isUser
                    ? "bg-primary text-on-primary rounded-br-md"
                    : "bg-surface-container-lowest border border-outline-variant text-on-surface rounded-bl-md"
                }`}>
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
            handleSend(input);
          }}
          className="p-4 border-t border-outline-variant bg-surface-container-lowest"
        >
          <div className="flex items-center gap-2 rounded-2xl border border-outline-variant bg-surface px-2 py-2">
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className="flex-1 bg-transparent px-3 py-2 text-sm focus:outline-none"
              placeholder="Demandez une analyse commerciale ou operationnelle"
              disabled={isLoading}
            />
            <Button type="submit" size="sm" disabled={isLoading || !input.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </form>
      </div>

      <div className="rounded-3xl border border-outline-variant bg-surface-container-lowest shadow-sm p-5 space-y-4 overflow-y-auto">
        <div>
          <p className="text-sm font-bold text-on-surface">Requetes rapides</p>
          <p className="text-xs text-secondary mt-1">Basees sur les donnees disponibles cote serveur.</p>
        </div>
        <div className="space-y-3">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => handleSend(suggestion)}
              className="w-full rounded-2xl border border-outline-variant bg-surface p-4 text-left hover:border-primary/40 hover:bg-primary/5 transition-colors"
            >
              <p className="text-sm font-semibold text-on-surface">{suggestion}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
