import { useEffect, useState } from "react";
import { BellRing, Save, UserRound } from "lucide-react";
import type { UserPreferences, UserSummary } from "../types";
import { getJson, patchJson } from "../lib/api";
import { Button } from "../components/ui";

export function SettingsView() {
  const [profile, setProfile] = useState<UserSummary | null>(null);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const [profilePayload, prefsPayload] = await Promise.all([
        getJson<UserSummary>("/api/v1/settings/profile"),
        getJson<UserPreferences>("/api/v1/settings/preferences"),
      ]);
      setProfile(profilePayload);
      setPrefs(prefsPayload);
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
    </div>
  );
}
