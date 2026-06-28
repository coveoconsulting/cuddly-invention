import { useEffect, useRef, useState } from "react";
import { BellRing, KeyRound, Save, Trash2, Upload, UserRound } from "lucide-react";
import type { UserPreferences, UserSummary } from "../types";
import { apiUrl, ApiError, getJson, patchJson, postJson, requestJson } from "../lib/api";
import { Button } from "../components/ui";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/Dialog";
import { useWorkspace } from "../context/WorkspaceContext";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeProfile(payload: unknown): UserSummary | null {
  return isRecord(payload) && typeof payload.id === "string" ? (payload as unknown as UserSummary) : null;
}

function normalizePreferences(payload: unknown): UserPreferences | null {
  return isRecord(payload) && typeof payload.userId === "string" ? (payload as unknown as UserPreferences) : null;
}

export function SettingsView() {
  const [profile, setProfile] = useState<UserSummary | null>(null);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const [profilePayload, prefsPayload] = await Promise.all([
        getJson<unknown>("/api/v1/settings/profile"),
        getJson<unknown>("/api/v1/settings/preferences"),
      ]);
      setProfile(normalizeProfile(profilePayload));
      setPrefs(normalizePreferences(prefsPayload));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const saveAll = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile || !prefs) {
      return;
    }
    setIsSaving(true);
    try {
      await Promise.all([
        patchJson("/api/v1/settings/profile", {
          name: profile.name,
          phone: profile.phone,
          email: profile.email,
        }),
        patchJson("/api/v1/settings/preferences", {
          emailNotifications: prefs.emailNotifications,
          weeklyDigest: prefs.weeklyDigest,
          autoSync: prefs.autoSync,
        }),
      ]);
      await loadSettings();
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !profile || !prefs) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 text-secondary">
          Chargement des parametres...
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <p className="text-sm text-secondary">Profil et preferences</p>
        <h1 className="text-3xl font-black text-on-surface mt-1">Parametres utilisateur</h1>
      </div>

      <form onSubmit={saveAll} className="space-y-6">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <UserRound className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-on-surface">Profil</h2>
          </div>
          <AvatarUploader profile={profile} onUpdated={(p) => setProfile(p)} />
          <div className="grid md:grid-cols-2 gap-4">
            <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} />
            <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} />
            <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm md:col-span-2" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} />
          </div>
        </div>

        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-on-surface">Preferences</h2>
          </div>
          <label className="flex items-center gap-3 text-sm text-on-surface">
            <input type="checkbox" checked={prefs.autoSync} onChange={() => setPrefs({ ...prefs, autoSync: !prefs.autoSync })} />
            Synchroniser automatiquement les commandes confirmees
          </label>
          <label className="flex items-center gap-3 text-sm text-on-surface">
            <input type="checkbox" checked={prefs.emailNotifications} onChange={() => setPrefs({ ...prefs, emailNotifications: !prefs.emailNotifications })} />
            Recevoir les notifications par email
          </label>
          <label className="flex items-center gap-3 text-sm text-on-surface">
            <input type="checkbox" checked={prefs.weeklyDigest} onChange={() => setPrefs({ ...prefs, weeklyDigest: !prefs.weeklyDigest })} />
            Digest hebdomadaire
          </label>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={isSaving}>
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? "Enregistrement..." : "Sauvegarder"}
          </Button>
        </div>
      </form>

      <PasswordChangeCard />
      <CrmSettingsCard />
    </div>
  );
}

function CrmSettingsCard() {
  const { can } = useWorkspace();
  const canEdit = can("settings.write");
  const [settings, setSettings] = useState<{
    quoteNumberPrefix: string; quoteNumberCounter: number; quoteValidityDays: number;
    defaultTaxRate: number; defaultPaymentTerms: string; defaultQuoteTerms: string;
    legalMentions: string; quoteEmailSubject: string; quoteEmailBody: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!canEdit) { setLoading(false); return; }
    void (async () => {
      try {
        const s = await getJson<typeof settings>(`/api/v1/crm-settings`);
        setSettings(s);
      } finally { setLoading(false); }
    })();
  }, [canEdit]);

  // Company-level quote/CRM settings are admin/manager territory, not self-service.
  if (!canEdit) return null;
  if (loading) return null;
  if (!settings) return null;

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await patchJson(`/api/v1/crm-settings`, settings);
      setMsg("Enregistré");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm space-y-3">
      <h2 className="text-sm font-bold text-on-surface">Paramètres devis &amp; CRM</h2>
      <p className="text-xs text-secondary">
        Visibles dans les devis PDF et utilisés pour la numérotation et les emails.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-secondary">Préfixe numéro de devis</label>
          <input className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" value={settings.quoteNumberPrefix}
            onChange={(e) => setSettings({ ...settings, quoteNumberPrefix: e.target.value })} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-secondary">Validité (jours)</label>
          <input type="number" className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" value={settings.quoteValidityDays}
            onChange={(e) => setSettings({ ...settings, quoteValidityDays: Number(e.target.value) })} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-secondary">TVA par défaut (%)</label>
          <input type="number" step="0.01" className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" value={settings.defaultTaxRate}
            onChange={(e) => setSettings({ ...settings, defaultTaxRate: Number(e.target.value) })} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-secondary">Compteur actuel (lecture seule)</label>
          <input disabled className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm opacity-60" value={settings.quoteNumberCounter} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-secondary">Conditions de paiement par défaut</label>
        <textarea rows={2} className="w-full resize-none rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" value={settings.defaultPaymentTerms}
          onChange={(e) => setSettings({ ...settings, defaultPaymentTerms: e.target.value })} />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-secondary">Conditions générales par défaut</label>
        <textarea rows={3} className="w-full resize-none rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" value={settings.defaultQuoteTerms}
          onChange={(e) => setSettings({ ...settings, defaultQuoteTerms: e.target.value })} />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-secondary">Mentions légales (pied de PDF)</label>
        <textarea rows={2} className="w-full resize-none rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" value={settings.legalMentions}
          onChange={(e) => setSettings({ ...settings, legalMentions: e.target.value })} />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-secondary">Sujet email d'envoi (variables : {"{{"}number{"}}"})</label>
        <input className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" value={settings.quoteEmailSubject}
          onChange={(e) => setSettings({ ...settings, quoteEmailSubject: e.target.value })} />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-secondary">Corps email (variables : {"{{"}link{"}}"} {"{{"}number{"}}"})</label>
        <textarea rows={4} className="w-full resize-none rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" value={settings.quoteEmailBody}
          onChange={(e) => setSettings({ ...settings, quoteEmailBody: e.target.value })} />
      </div>
      <div className="flex items-center justify-end gap-2">
        {msg ? <p className="text-xs text-secondary">{msg}</p> : null}
        <Button size="sm" onClick={() => void save()} loading={saving}>
          <Save className="mr-1 h-3.5 w-3.5" /> Enregistrer
        </Button>
      </div>
    </div>
  );
}

function AvatarUploader({ profile, onUpdated }: { profile: UserSummary; onUpdated: (p: UserSummary) => void }) {
  const { refreshSession } = useWorkspace();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const upload = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
        throw new Error("Format accepté : PNG, JPEG ou WebP.");
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("Image trop lourde (max 5 Mo).");
      }
      const res = await fetch(apiUrl(`/api/v1/settings/avatar`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) {
        const t = await res.json().catch(() => ({}));
        throw new Error((t as { error?: string }).error || `Upload échoué (${res.status})`);
      }
      const updated = (await res.json()) as UserSummary;
      onUpdated(updated);
      await refreshSession();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    setError(null);
    try {
      const updated = await requestJson<UserSummary>(`/api/v1/settings/avatar`, { method: "DELETE" });
      onUpdated(updated);
      await refreshSession();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="flex items-center gap-4 rounded-xl border border-outline-variant bg-surface p-4">
      {profile.avatarUrl ? (
        <img src={profile.avatarUrl} alt={profile.name} className="h-16 w-16 rounded-full object-cover" />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ink text-xl font-bold text-white">
          {profile.initials}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-on-surface">Photo de profil</p>
        <p className="text-[11px] text-secondary">PNG, JPEG ou WebP — 5 Mo max. Remplace vos initiales partout dans l'app.</p>
        {error ? <p className="mt-1 text-[11px] text-error">{error}</p> : null}
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1b4139] disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" /> {uploading ? "Envoi…" : profile.avatarUrl ? "Changer" : "Téléverser"}
          </button>
          {profile.avatarUrl ? (
            <button
              type="button"
              onClick={() => void remove()}
              className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant px-3 py-1.5 text-xs font-semibold text-secondary hover:text-error"
            >
              <Trash2 className="h-3.5 w-3.5" /> Retirer
            </button>
          ) : null}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </div>
  );
}

function PasswordChangeCard() {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmation) {
      setError("Les deux mots de passe ne correspondent pas.");
      setStatus("error");
      return;
    }
    setStatus("saving");
    try {
      await postJson("/api/v1/auth/password", { currentPassword, newPassword });
      setStatus("ok");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      toast.success("Mot de passe mis à jour");
    } catch (reason) {
      setStatus("error");
      const message = reason instanceof ApiError ? reason.message : "Erreur lors du changement de mot de passe.";
      setError(message);
      toast.error(message);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold text-on-surface">Mot de passe</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <input
          type="password"
          className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
          placeholder="Mot de passe actuel"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
        />
        <input
          type="password"
          className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
          placeholder="Nouveau (min. 12 car.)"
          minLength={12}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          required
        />
        <input
          type="password"
          className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
          placeholder="Confirmer"
          minLength={12}
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          required
        />
      </div>
      {status === "ok" ? (
        <p className="text-xs text-primary">Mot de passe mis a jour.</p>
      ) : null}
      {status === "error" && error ? (
        <p className="text-xs text-error">{error}</p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" variant="outline" loading={status === "saving"}>
          Changer le mot de passe
        </Button>
      </div>
    </form>
  );
}
