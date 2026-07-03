import { useState } from "react";
import { Phone } from "lucide-react";
import { ApiError, patchJson, postJson } from "../lib/api";
import { Button } from "./ui";
import { useToast } from "./Toast";
import { useWorkspace } from "../context/WorkspaceContext";
import { CALL_DISPOSITIONS, MISSED_CALL_DISPOSITIONS, planHasFeature, type CallDisposition } from "../types";
import { callDispositionLabel } from "../lib/labels";

import { useTranslation } from "../i18n";
type Props = {
  phone: string;
  name: string;
  clientId?: string | null;
  prospectId?: string | null;
  /** When set, completes an existing planned call (PATCH) instead of creating a new one (POST). */
  callId?: string | null;
  /** Optional label for the trigger (defaults to "Appeler"). */
  label?: string;
  /** Called after a call has been logged so the parent can refresh. */
  onLogged?: () => void;
};

// Click-to-call with mandatory disposition logging. Clicking dials (tel:) AND opens
// a modal that the rep must complete with an outcome, so no call goes unlogged.
// Optionally schedules a follow-up task. Mirrors the call-center métier standard.
export function CallButton({ phone, name, clientId, prospectId, callId, label, onLogged }: Props) {
  const { t } = useTranslation();
  const { can, company } = useWorkspace();
  const toast = useToast();
  const canLog = can("clients.write");
  const clickToCall = planHasFeature(company?.plan, "click_to_call");
  const [open, setOpen] = useState(false);
  const [disposition, setDisposition] = useState<CallDisposition | "">("");
  const [minutes, setMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState(false);
  const [followUpAt, setFollowUpAt] = useState("");
  const [saving, setSaving] = useState(false);

  // Click-to-call is a plan feature; hide the affordance when the plan doesn't include it.
  if (!phone || !clickToCall) return null;

  const reset = () => {
    setDisposition("");
    setMinutes("");
    setNotes("");
    setFollowUp(false);
    setFollowUpAt("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!disposition) return;
    setSaving(true);
    try {
      const status = MISSED_CALL_DISPOSITIONS.includes(disposition) ? "missed" : "completed";
      const durationSeconds = Math.max(0, Math.round(Number(minutes) || 0) * 60);
      if (callId) {
        // Completing a call that was already planned in the agenda.
        await patchJson(`/api/v1/calls/${callId}`, { status, durationSeconds, outcome: disposition, notes });
      } else {
        await postJson("/api/v1/calls", {
          subject: `Appel — ${name}`,
          phone,
          clientId: clientId ?? null,
          clientName: name,
          status,
          scheduledAt: new Date().toISOString(),
          durationSeconds,
          outcome: disposition,
          notes,
        });
      }
      if (followUp && followUpAt) {
        await postJson("/api/v1/activities", {
          type: "task",
          subject: `Relance — ${name}`,
          content: notes,
          clientId: clientId ?? undefined,
          prospectId: prospectId ?? undefined,
          dueDate: new Date(followUpAt).toISOString(),
        }).catch(() => undefined);
      }
      toast.success("Appel journalisé", { title: callDispositionLabel[disposition] });
      setOpen(false);
      reset();
      onLogged?.();
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "Journalisation impossible");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <a
        href={`tel:${phone}`}
        onClick={() => { if (canLog) setOpen(true); }}
        className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/15"
      >
        <Phone className="h-3 w-3" />
        {label ?? "Appeler"}
      </a>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form onSubmit={(e) => void submit(e)} className="w-full max-w-md space-y-3 rounded-2xl border border-outline-variant bg-white p-6 shadow-2xl">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-secondary">{t("callButton.auto.journaliserLappel")}</p>
              <h3 className="mt-1 text-lg font-black text-on-surface">{name}</h3>
              <p className="text-xs text-secondary">{phone}</p>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-secondary">{t("callButton.auto.resultatDeLappel")}</label>
              <select
                required
                value={disposition}
                onChange={(e) => setDisposition(e.target.value as CallDisposition | "")}
                className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
              >
                <option value="">{t("callButton.auto.selectionnerUnResultat")}</option>
                {CALL_DISPOSITIONS.map((d) => (
                  <option key={d} value={d}>{callDispositionLabel[d]}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-secondary">{t("callButton.auto.dureeMin")}</span>
                <input type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-2.5 text-sm" />
              </label>
              <label className="flex items-end gap-2 pb-1 text-sm text-on-surface">
                <input type="checkbox" className="h-4 w-4" checked={followUp} onChange={(e) => setFollowUp(e.target.checked)} />
                <span>{t("callButton.auto.planifierUneRelance")}</span>
              </label>
            </div>

            {followUp ? (
              <input type="datetime-local" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-2.5 text-sm" />
            ) : null}

            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("callButton.auto.notesDappel")} className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setOpen(false); reset(); }}>{t("callButton.auto.annuler")}</Button>
              <Button type="submit" loading={saving} disabled={!disposition}>{t("callButton.auto.enregistrer")}</Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
