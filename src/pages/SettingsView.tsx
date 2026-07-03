import { useEffect, useRef, useState } from "react";
import { BellRing, KeyRound, Save, Trash2, Upload, UserRound } from "lucide-react";
import type { UserPreferences, UserSummary } from "../types";
import { apiUrl, ApiError, getJson, patchJson, postJson, requestJson } from "../lib/api";
import { Button } from "../components/ui";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/Dialog";
import { useWorkspace } from "../context/WorkspaceContext";
import { useTranslation } from "../i18n";

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
  const { t } = useTranslation();
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
          {t("settings.loading")}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <p className="text-sm text-secondary">{t("settings.eyebrow")}</p>
        <h1 className="text-3xl font-black text-on-surface mt-1">{t("settings.title")}</h1>
      </div>

      <form onSubmit={saveAll} className="space-y-6">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <UserRound className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-on-surface">{t("settings.profile.label")}</h2>
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
            <h2 className="text-sm font-bold text-on-surface">{t("settings.preferences.label")}</h2>
          </div>
          <label className="flex items-center gap-3 text-sm text-on-surface">
            <input type="checkbox" checked={prefs.autoSync} onChange={() => setPrefs({ ...prefs, autoSync: !prefs.autoSync })} />
            {t("settings.preferences.autoSync")}
          </label>
          <label className="flex items-center gap-3 text-sm text-on-surface">
            <input type="checkbox" checked={prefs.emailNotifications} onChange={() => setPrefs({ ...prefs, emailNotifications: !prefs.emailNotifications })} />
            {t("settings.preferences.emailNotifications")}
          </label>
          <label className="flex items-center gap-3 text-sm text-on-surface">
            <input type="checkbox" checked={prefs.weeklyDigest} onChange={() => setPrefs({ ...prefs, weeklyDigest: !prefs.weeklyDigest })} />
            {t("settings.preferences.weeklyDigest")}
          </label>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={isSaving}>
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? t("settings.preferences.saving") : t("settings.preferences.save")}
          </Button>
        </div>
      </form>

      <PasswordChangeCard />
      <CrmSettingsCard />
    </div>
  );
}

function CrmSettingsCard() {
  const { t } = useTranslation();
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
      setMsg(t("settings.crm.saved"));
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm space-y-3">
      <h2 className="text-sm font-bold text-on-surface">{t("settings.crm.label")}</h2>
      <p className="text-xs text-secondary">
        {t("settings.crm.subtitle")}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-secondary">{t("settings.crm.quotePrefix")}</label>
          <input className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" value={settings.quoteNumberPrefix}
            onChange={(e) => setSettings({ ...settings, quoteNumberPrefix: e.target.value })} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-secondary">{t("settings.crm.quoteValidity")}</label>
          <input type="number" className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" value={settings.quoteValidityDays}
            onChange={(e) => setSettings({ ...settings, quoteValidityDays: Number(e.target.value) })} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-secondary">{t("settings.crm.defaultTax")}</label>
          <input type="number" step="0.01" className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" value={settings.defaultTaxRate}
            onChange={(e) => setSettings({ ...settings, defaultTaxRate: Number(e.target.value) })} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-secondary">{t("settings.crm.quoteCounter")}</label>
          <input disabled className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm opacity-60" value={settings.quoteNumberCounter} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-secondary">{t("settings.crm.paymentTerms")}</label>
        <textarea rows={2} className="w-full resize-none rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" value={settings.defaultPaymentTerms}
          onChange={(e) => setSettings({ ...settings, defaultPaymentTerms: e.target.value })} />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-secondary">{t("settings.crm.quoteTerms")}</label>
        <textarea rows={3} className="w-full resize-none rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" value={settings.defaultQuoteTerms}
          onChange={(e) => setSettings({ ...settings, defaultQuoteTerms: e.target.value })} />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-secondary">{t("settings.crm.legalMentions")}</label>
        <textarea rows={2} className="w-full resize-none rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" value={settings.legalMentions}
          onChange={(e) => setSettings({ ...settings, legalMentions: e.target.value })} />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-secondary">{t("settings.crm.emailSubject")}</label>
        <input className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" value={settings.quoteEmailSubject}
          onChange={(e) => setSettings({ ...settings, quoteEmailSubject: e.target.value })} />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-secondary">{t("settings.crm.emailBody")}</label>
        <textarea rows={4} className="w-full resize-none rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" value={settings.quoteEmailBody}
          onChange={(e) => setSettings({ ...settings, quoteEmailBody: e.target.value })} />
      </div>
      <div className="flex items-center justify-end gap-2">
        {msg ? <p className="text-xs text-secondary">{msg}</p> : null}
        <Button size="sm" onClick={() => void save()} loading={saving}>
          <Save className="mr-1 h-3.5 w-3.5" /> {t("settings.crm.save")}
        </Button>
      </div>
    </div>
  );
}

function AvatarUploader({ profile, onUpdated }: { profile: UserSummary; onUpdated: (p: UserSummary) => void }) {
  const { t } = useTranslation();
  const { refreshSession } = useWorkspace();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const upload = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
        throw new Error(t("settings.profile.invalidFormat"));
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new Error(t("settings.profile.imageTooBig"));
      }
      const res = await fetch(apiUrl(`/api/v1/settings/avatar`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error((payload as { error?: string }).error || t("settings.profile.uploadFailed", { status: res.status }));
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
        <p className="text-sm font-bold text-on-surface">{t("settings.profile.avatar")}</p>
        <p className="text-[11px] text-secondary">{t("settings.profile.avatarHint")}</p>
        {error ? <p className="mt-1 text-[11px] text-error">{error}</p> : null}
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1b4139] disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" /> {uploading ? t("settings.profile.uploading") : profile.avatarUrl ? t("settings.profile.change") : t("settings.profile.upload")}
          </button>
          {profile.avatarUrl ? (
            <button
              type="button"
              onClick={() => void remove()}
              className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant px-3 py-1.5 text-xs font-semibold text-secondary hover:text-error"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("settings.profile.remove")}
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
  const { t } = useTranslation();
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
      setError(t("settings.password.mismatch"));
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
      toast.success(t("settings.password.updated"));
    } catch (reason) {
      setStatus("error");
      const message = reason instanceof ApiError ? reason.message : t("settings.password.error");
      setError(message);
      toast.error(message);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold text-on-surface">{t("settings.password.label")}</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <input
          type="password"
          className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
          placeholder={t("settings.password.current")}
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
        />
        <input
          type="password"
          className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
          placeholder={t("settings.password.new")}
          minLength={12}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          required
        />
        <input
          type="password"
          className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
          placeholder={t("settings.password.confirm")}
          minLength={12}
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          required
        />
      </div>
      {status === "ok" ? (
        <p className="text-xs text-primary">{t("settings.password.updatedInline")}</p>
      ) : null}
      {status === "error" && error ? (
        <p className="text-xs text-error">{error}</p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" variant="outline" loading={status === "saving"}>
          {t("settings.password.change")}
        </Button>
      </div>
    </form>
  );
}
