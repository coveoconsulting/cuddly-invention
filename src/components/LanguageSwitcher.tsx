import { useEffect, useRef, useState } from "react";
import { Check, Languages } from "lucide-react";
import { LANGS, useTranslation } from "../i18n";

// App-wide language switcher (FR / AR / EN). Lives in the header; the choice is
// persisted by the i18n provider and flips <html dir> to RTL for Arabic.
export function LanguageSwitcher() {
  const { lang, setLang, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handle = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handle);
    return () => document.removeEventListener("pointerdown", handle);
  }, []);

  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("lang.change")}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-10 items-center gap-1.5 rounded-lg border border-outline-variant bg-white/80 px-2.5 transition-all hover:bg-white hover:shadow-sm"
      >
        <Languages className="h-4 w-4 text-secondary" />
        <span className="text-xs font-bold uppercase text-secondary">{current.code}</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute end-0 top-full z-40 mt-2 w-44 overflow-hidden rounded-xl border border-outline-variant bg-white py-1 shadow-[0_24px_60px_rgba(20,33,28,0.18)]"
        >
          <p className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-secondary">
            {t("lang.label")}
          </p>
          {LANGS.map((l) => {
            const active = l.code === lang;
            return (
              <button
                key={l.code}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setLang(l.code);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-surface ${
                  active ? "font-bold text-on-surface" : "text-secondary"
                }`}
              >
                <span dir={l.dir}>{l.native}</span>
                {active ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
