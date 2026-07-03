import { useEffect, useMemo, useState } from "react";
import { Clock3, MapPin, Plus, Route, Search } from "lucide-react";
import { Link } from "react-router-dom";
import type { Visit } from "../types";
import { ApiError, asArray, getJson, postJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { visitStatusTone } from "../lib/labels";
import { toLocalIsoDate } from "../lib/dateDefaults";
import { useWorkspace } from "../context/WorkspaceContext";
import { useTranslation } from "../i18n";

type VisitFilter = "all" | "today" | "open" | "completed";

export function VisitsView() {
  const { can } = useWorkspace();
  const { t } = useTranslation();
  const toast = useToast();
  const today = toLocalIsoDate();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<VisitFilter>("all");
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    clientName: "",
    address: "",
    city: "",
    objective: "",
    scheduledDate: today,
    startTime: "09:00",
    endTime: "10:00",
  });

  const loadVisits = async () => {
    setIsLoading(true);
    try {
      const payload = await getJson<unknown>("/api/v1/visits");
      setVisits(asArray<Visit>(payload));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadVisits();
  }, []);

  const filteredVisits = useMemo(() => {
    return visits.filter((visit) => {
      const matchesQuery =
        visit.clientName.toLowerCase().includes(query.toLowerCase()) ||
        visit.objective.toLowerCase().includes(query.toLowerCase()) ||
        visit.city.toLowerCase().includes(query.toLowerCase());

      const matchesFilter =
        filter === "all"
          ? true
          : filter === "today"
            ? visit.scheduledDate === today
            : filter === "open"
              ? visit.status === "planned" || visit.status === "in_progress"
              : visit.status === "completed";

      return matchesQuery && matchesFilter;
    });
  }, [filter, query, today, visits]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await postJson("/api/v1/visits", form);
      toast.success(t("visits.toast.planned"), { title: form.clientName });
      setShowCreate(false);
      setForm({
        clientName: "",
        address: "",
        city: "",
        objective: "",
        scheduledDate: today,
        startTime: "09:00",
        endTime: "10:00",
      });
      await loadVisits();
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : t("visits.err.create"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 p-4 md:p-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm text-secondary">{t("visits.eyebrow")}</p>
          <h1 className="mt-1 text-3xl font-black text-on-surface">{t("visits.title")}</h1>
        </div>
        {can("visits.write") ? (
          <Button className="self-start gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            {t("visits.new")}
          </Button>
        ) : null}
      </div>

      <div className="space-y-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-secondary" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-xl border border-outline-variant bg-surface px-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder={t("visits.searchPh")}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { key: "all", label: t("visits.filter.all") },
            { key: "today", label: t("visits.filter.today") },
            { key: "open", label: t("visits.filter.open") },
            { key: "completed", label: t("visits.filter.completed") },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key as VisitFilter)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                filter === item.key
                  ? "border-primary bg-primary text-on-primary"
                  : "border-outline-variant bg-surface text-secondary hover:bg-surface-container"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm">
          <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
            <div>
              <p className="text-sm font-bold text-on-surface">{t("visits.list")}</p>
              <p className="text-xs text-secondary">{t("visits.listSub")}</p>
            </div>
            <Badge variant="neutral">{filteredVisits.length}</Badge>
          </div>

          {isLoading ? (
            <div className="divide-y divide-outline-variant">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-2 p-5">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              ))}
            </div>
          ) : filteredVisits.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title={t("visits.empty.title")}
                description={t("visits.empty.desc")}
              />
            </div>
          ) : (
            <div className="divide-y divide-outline-variant">
              {filteredVisits.map((visit) => (
                <Link
                  key={visit.id}
                  to={`/visits/${visit.id}`}
                  className="block p-5 transition-colors hover:bg-surface"
                >
                  <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-on-surface">{visit.clientName}</p>
                        <Badge variant={visitStatusTone(visit.status)}>
                          {t(`enum.visitStatus.${visit.status}`)}
                        </Badge>
                        <Badge variant="neutral">{visit.territoryLabel}</Badge>
                      </div>
                      <p className="text-xs text-secondary">{visit.objective}</p>
                      <div className="flex flex-wrap gap-4 text-xs text-secondary">
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-primary" />
                          {visit.address}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock3 className="h-3.5 w-3.5 text-primary" />
                          {visit.scheduledDate} | {visit.startTime} - {visit.endTime}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-secondary">
                      <p>{t("visits.ownerLine", { name: visit.ownerName })}</p>
                      <p>{t("visits.checkInLine", { value: visit.checkInAt ? t("common.yes") : t("common.no") })}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-outline-variant bg-[#0f7b36] p-6 text-white shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Route className="h-5 w-5" />
          <h2 className="text-lg font-bold">{t("visits.routeSummary")}</h2>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-xs uppercase tracking-wider text-white/75">{t("visits.toProcess")}</p>
              <p className="mt-2 text-3xl font-black">
                {visits.filter((visit) => visit.status === "planned" || visit.status === "in_progress").length}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-xs uppercase tracking-wider text-white/75">{t("visits.completed")}</p>
              <p className="mt-2 text-3xl font-black">
                {visits.filter((visit) => visit.status === "completed").length}
              </p>
            </div>
            <p className="text-sm leading-relaxed text-white/85">
              {t("visits.routeNote")}
            </p>
          </div>
        </div>
      </div>

      {showCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form
            onSubmit={(event) => void handleCreate(event)}
            className="w-full max-w-2xl space-y-4 rounded-3xl border border-outline-variant bg-surface-container-lowest p-6 shadow-xl"
          >
            <div>
              <p className="text-sm font-bold text-on-surface">{t("visits.form.title")}</p>
              <p className="mt-1 text-xs text-secondary">{t("visits.form.sub")}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                placeholder={t("visits.form.namePh")}
                value={form.clientName}
                onChange={(event) => setForm({ ...form, clientName: event.target.value })}
                required
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                placeholder={t("visits.form.cityPh")}
                value={form.city}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
                required
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm md:col-span-2"
                placeholder={t("visits.form.addressPh")}
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
                required
              />
              <textarea
                className="min-h-24 rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm md:col-span-2"
                placeholder={t("visits.form.objectivePh")}
                value={form.objective}
                onChange={(event) => setForm({ ...form, objective: event.target.value })}
                required
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                type="date"
                value={form.scheduledDate}
                onChange={(event) => setForm({ ...form, scheduledDate: event.target.value })}
                required
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                type="time"
                value={form.startTime}
                onChange={(event) => setForm({ ...form, startTime: event.target.value })}
                required
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                type="time"
                value={form.endTime}
                onChange={(event) => setForm({ ...form, endTime: event.target.value })}
                required
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={saving}>{t("visits.form.create")}</Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
