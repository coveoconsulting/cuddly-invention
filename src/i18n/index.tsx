import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LANG, DICTIONARIES, LANGS, type Dict, type Lang } from "./locales";

// ---------------------------------------------------------------------------
// Lightweight, zero-dependency i18n.
//
// Why not react-i18next: this app ships as a Capacitor bundle that must run
// offline, and the surface we need (lookup + interpolation + RTL direction) is
// small. A ~40-line provider keeps the bundle lean and the mental model simple.
//
// Adoption is incremental: call useTranslation() in a view and replace hardcoded
// strings with t("namespace.key"). Missing keys fall back to French, then to the
// key itself — so a half-translated view never renders blank.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "fc.lang";

function isLang(value: unknown): value is Lang {
  return value === "fr" || value === "ar" || value === "en";
}

function detectInitialLang(): Lang {
  if (typeof window === "undefined") return DEFAULT_LANG;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    /* localStorage blocked (private mode / webview) — fall through */
  }
  // FR-first product: default to French and let the user opt into AR/EN via the
  // switcher. We intentionally do NOT auto-detect from navigator.language yet —
  // while translation coverage is rolled out per view, an en/ar browser would
  // otherwise show a shell in one language and untranslated views in French.
  return DEFAULT_LANG;
}

function dirFor(lang: Lang): "ltr" | "rtl" {
  return LANGS.find((l) => l.code === lang)?.dir ?? "ltr";
}

// Reflect the active language onto <html> so text direction, form controls and
// the lang attribute (screen readers, hyphenation) all follow suit.
function applyDocumentLang(lang: Lang) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.lang = lang;
  el.dir = dirFor(lang);
}

type Vars = Record<string, string | number>;

type I18nContextType = {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Vars) => string;
};

const I18nContext = createContext<I18nContextType | undefined>(undefined);

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);

  // Apply on mount and whenever the language changes.
  useEffect(() => {
    applyDocumentLang(lang);
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore persistence failures */
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Vars): string => {
      const active: Dict = DICTIONARIES[lang] ?? {};
      const fallback: Dict = DICTIONARIES[DEFAULT_LANG] ?? {};
      const template = active[key] ?? fallback[key] ?? key;
      return interpolate(template, vars);
    },
    [lang],
  );

  const value = useMemo<I18nContextType>(
    () => ({ lang, dir: dirFor(lang), setLang, t }),
    [lang, setLang, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useTranslation must be used within an I18nProvider");
  }
  return ctx;
}

export { LANGS, type Lang } from "./locales";
