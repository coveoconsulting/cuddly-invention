import { useRef, useState } from "react";
import { CalendarPlus, FileText, Loader2, Mail, Mic, Square, Target, Wand2 } from "lucide-react";
import { apiUrl, ApiError, postJson } from "../lib/api";
import { sendOrQueue } from "../lib/offlineQueue";
import { Button } from "./ui";
import { useToast } from "./Toast";
import { useTranslation } from "../i18n";

// Dictation languages. `stt` is the Whisper language code sent to transcription;
// Darija (Moroccan) has no distinct Whisper code, so it transcribes as Arabic but
// carries a dialect hint so the LLM interprets it correctly. Whatever the spoken
// language, the server normalizes the CRM summary back to French for the manager.
type VoiceLang = "fr" | "darija" | "ar" | "en";
const VOICE_LANGS: Array<{ id: VoiceLang; labelKey: string; stt: string }> = [
  { id: "fr", labelKey: "voice.lang.fr", stt: "fr" },
  { id: "darija", labelKey: "voice.lang.darija", stt: "ar" },
  { id: "ar", labelKey: "voice.lang.ar", stt: "ar" },
  { id: "en", labelKey: "voice.lang.en", stt: "en" },
];

interface VoiceActions {
  summary?: string;
  qualification?: { need?: string; solutionFit?: string };
  schedule?: { type?: "call" | "meeting" | "task"; subject?: string; dateTime?: string } | null;
  opportunityAmount?: number | null;
  email?: { subject?: string; body?: string } | null;
  createQuote?: boolean;
}

interface VoiceIntakeProps {
  entityName: string;
  prospectId?: string;
  clientId?: string;
  currency?: string;
  onApplied?: () => void | Promise<void>;
  onCreateQuote?: () => void | Promise<void>;
}

function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

/**
 * Voice-to-CRM intake (open-source models via Groq: Whisper + Llama).
 * Records a spoken note, transcribes it, proposes structured CRM actions,
 * and only writes after the user confirms.
 */
export function VoiceIntake({ entityName, prospectId, clientId, currency = "MAD", onApplied, onCreateQuote }: VoiceIntakeProps) {
  const toast = useToast();
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [transcript, setTranscript] = useState("");
  const [actions, setActions] = useState<VoiceActions | null>(null);
  const [scheduleAt, setScheduleAt] = useState("");
  const [voiceLang, setVoiceLang] = useState<VoiceLang>("darija");

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const analyzeText = async (text: string) => {
    setProcessing(true);
    try {
      const res = await postJson<{ transcript: string; actions: VoiceActions }>(`/api/v1/ai/voice-intake`, {
        text,
        entityName,
        // Tell the LLM which language was spoken (esp. Darija) so it interprets
        // the note correctly. The summary/qualification always come back in French.
        lang: voiceLang,
      });
      setTranscript(res.transcript || text);
      setActions(res.actions || {});
      setScheduleAt(toLocalInput(res.actions?.schedule?.dateTime || ""));
      setOpen(true);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Analyse impossible");
    } finally {
      setProcessing(false);
    }
  };

  const processAudio = async (blob: Blob) => {
    setProcessing(true);
    try {
      const stt = VOICE_LANGS.find((l) => l.id === voiceLang)?.stt || "fr";
      const r = await fetch(apiUrl(`/api/v1/ai/transcribe?lang=${encodeURIComponent(stt)}`), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": blob.type || "audio/webm" },
        body: blob,
      });
      if (!r.ok) {
        const reason = await r.json().catch(() => null);
        throw new Error(reason?.error || "Transcription impossible");
      }
      const { text } = (await r.json()) as { text: string };
      if (!text) {
        toast.error("Rien n'a été compris, réessayez");
        setProcessing(false);
        return;
      }
      await analyzeText(text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transcription impossible");
      setProcessing(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        void processAudio(blob);
      };
      mediaRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      toast.error(t("voice.micUnavailable"));
    }
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  const setNeed = (need: string) => setActions((a) => ({ ...a, qualification: { ...a?.qualification, need } }));
  const setFit = (solutionFit: string) => setActions((a) => ({ ...a, qualification: { ...a?.qualification, solutionFit } }));
  const setSubject = (subject: string) => setActions((a) => ({ ...a, schedule: { ...(a?.schedule || {}), subject } }));
  const setEmailSubject = (subject: string) => setActions((a) => ({ ...a, email: { ...(a?.email || {}), subject } }));
  const setEmailBody = (body: string) => setActions((a) => ({ ...a, email: { ...(a?.email || {}), body } }));

  const apply = async () => {
    if (!actions) return;
    setApplying(true);
    let done = 0;
    let queued = false;
    try {
      const need = actions.qualification?.need?.trim();
      const fit = actions.qualification?.solutionFit?.trim();
      if (prospectId && (need || fit)) {
        const r = await sendOrQueue(
          "PATCH",
          `/api/v1/prospects/${prospectId}`,
          { ...(need ? { need } : {}), ...(fit ? { solutionFit: fit } : {}) },
          `Qualification — ${entityName}`,
        );
        queued = queued || r.queued;
        done += 1;
      }

      if (actions.schedule && scheduleAt) {
        const r = await sendOrQueue(
          "POST",
          `/api/v1/activities`,
          {
            type: actions.schedule.type || "call",
            subject: actions.schedule.subject?.trim() || `Suivi — ${entityName}`,
            content: actions.summary || "",
            dueDate: new Date(scheduleAt).toISOString(),
            ...(prospectId ? { prospectId } : {}),
            ...(clientId ? { clientId } : {}),
          },
          `Agenda — ${entityName}`,
        );
        queued = queued || r.queued;
        done += 1;
      }

      if (queued) {
        toast.info(`${done} action${done > 1 ? "s" : ""} en file — synchronisée${done > 1 ? "s" : ""} au retour du réseau`, { title: "Hors-ligne" });
      } else {
        toast.success(`${done} action${done > 1 ? "s" : ""} appliquée${done > 1 ? "s" : ""}`, { title: "CRM mis à jour" });
      }
      setOpen(false);
      setActions(null);
      setTyped("");
      await onApplied?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Application impossible");
    } finally {
      setApplying(false);
    }
  };

  const copyEmail = async () => {
    const e = actions?.email;
    if (!e) return;
    await navigator.clipboard?.writeText(`Objet : ${e.subject || ""}\n\n${e.body || ""}`);
    toast.success("Email copié");
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={voiceLang}
          onChange={(e) => setVoiceLang(e.target.value as VoiceLang)}
          aria-label={t("voice.language")}
          disabled={recording || processing}
          className="rounded-lg border border-outline-variant bg-surface px-2 py-1.5 text-xs font-semibold text-secondary outline-none focus:border-primary disabled:opacity-60"
        >
          {VOICE_LANGS.map((l) => (
            <option key={l.id} value={l.id}>{t(l.labelKey)}</option>
          ))}
        </select>
        {recording ? (
          <Button size="sm" variant="outline" onClick={stopRecording} className="border-error text-error">
            <Square className="mr-1 h-3.5 w-3.5 fill-current" /> {t("voice.stop")}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => void startRecording()} disabled={processing}>
            {processing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Mic className="mr-1 h-3.5 w-3.5" />}
            {processing ? t("voice.analyzing") : t("voice.record")}
          </Button>
        )}
        <div className="flex flex-1 items-center gap-1.5">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && typed.trim()) void analyzeText(typed.trim()); }}
            placeholder={t("voice.hint")}
            className="min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface px-3 py-1.5 text-xs outline-none focus:border-primary"
          />
          <Button size="sm" variant="ghost" onClick={() => typed.trim() && void analyzeText(typed.trim())} disabled={processing || !typed.trim()}>
            <Wand2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {open && actions ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[88vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl border border-outline-variant bg-white p-5 shadow-2xl">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-secondary">Assistant vocal</p>
              <h3 className="mt-0.5 text-lg font-black text-on-surface">À confirmer avant d'écrire</h3>
              {actions.summary ? <p className="mt-1 text-sm text-secondary">{actions.summary}</p> : null}
            </div>

            <div className="rounded-lg bg-surface-container px-3 py-2 text-xs italic text-secondary">« {transcript} »</div>

            {prospectId ? (
              <div className="space-y-2 rounded-xl border border-outline-variant p-3">
                <p className="flex items-center gap-1.5 text-xs font-bold text-on-surface"><Target className="h-3.5 w-3.5 text-primary" /> Qualification</p>
                <textarea rows={2} value={actions.qualification?.need || ""} onChange={(e) => setNeed(e.target.value)} placeholder="Besoin détecté" className="w-full resize-none rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" />
                <textarea rows={2} value={actions.qualification?.solutionFit || ""} onChange={(e) => setFit(e.target.value)} placeholder="Adéquation avec notre offre" className="w-full resize-none rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" />
              </div>
            ) : null}

            {actions.schedule ? (
              <div className="space-y-2 rounded-xl border border-outline-variant p-3">
                <p className="flex items-center gap-1.5 text-xs font-bold text-on-surface"><CalendarPlus className="h-3.5 w-3.5 text-primary" /> Planifier dans l'agenda</p>
                <input value={actions.schedule.subject || ""} onChange={(e) => setSubject(e.target.value)} placeholder="Intitulé" className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" />
                <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" />
              </div>
            ) : null}

            {typeof actions.opportunityAmount === "number" && actions.opportunityAmount > 0 ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-outline-variant p-3">
                <p className="flex items-center gap-1.5 text-xs font-bold text-on-surface"><FileText className="h-3.5 w-3.5 text-primary" /> Devis ~ {actions.opportunityAmount.toLocaleString("fr-FR")} {currency}</p>
                {onCreateQuote ? (
                  <Button size="sm" variant="outline" onClick={() => void onCreateQuote()}>Créer le devis</Button>
                ) : null}
              </div>
            ) : null}

            {actions.email ? (
              <div className="space-y-2 rounded-xl border border-outline-variant p-3">
                <p className="flex items-center gap-1.5 text-xs font-bold text-on-surface"><Mail className="h-3.5 w-3.5 text-primary" /> Brouillon d'email</p>
                <input value={actions.email.subject || ""} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Objet" className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" />
                <textarea rows={4} value={actions.email.body || ""} onChange={(e) => setEmailBody(e.target.value)} className="w-full resize-none rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" />
                <Button size="sm" variant="ghost" onClick={() => void copyEmail()}>Copier l'email</Button>
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => { setOpen(false); setActions(null); }}>Annuler</Button>
              <Button onClick={() => void apply()} loading={applying}>Confirmer & écrire</Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
