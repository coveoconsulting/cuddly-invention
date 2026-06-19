import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import type { Activity, Visit } from "../types";
import { asArray, getJson } from "../lib/api";
import { Badge } from "../components/ui";
import { visitStatusLabel, visitStatusTone } from "../lib/labels";

function startOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + offset);
  result.setHours(0, 0, 0, 0);
  return result;
}

function formatIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDayHeader(date: Date) {
  return date.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" });
}

const DAY_COUNT = 7;

export function AgendaView() {
  const [anchor, setAnchor] = useState(startOfWeek(new Date()));
  const [visits, setVisits] = useState<Visit[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const days = useMemo(() => {
    return Array.from({ length: DAY_COUNT }, (_value, index) => {
      const date = new Date(anchor);
      date.setDate(anchor.getDate() + index);
      return date;
    });
  }, [anchor]);

  const load = async () => {
    setIsLoading(true);
    try {
      const [visitsPayload, activitiesPayload] = await Promise.all([
        getJson<unknown>("/api/v1/visits"),
        getJson<unknown>("/api/v1/activities"),
      ]);
      setVisits(asArray<Visit>(visitsPayload));
      setActivities(asArray<Activity>(activitiesPayload));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const goPrev = () => {
    const next = new Date(anchor);
    next.setDate(anchor.getDate() - DAY_COUNT);
    setAnchor(next);
  };
  const goNext = () => {
    const next = new Date(anchor);
    next.setDate(anchor.getDate() + DAY_COUNT);
    setAnchor(next);
  };
  const goToday = () => setAnchor(startOfWeek(new Date()));

  return (
    <div className="mx-auto max-w-[1380px] space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-secondary">Planning</p>
          <h1 className="mt-1 text-3xl font-black text-on-surface">Agenda</h1>
          <p className="mt-1 text-sm text-secondary">Visites planifiées et tâches à échéance.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant bg-white hover:bg-surface"
            aria-label="Semaine précédente"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-lg border border-outline-variant bg-white px-3 py-2 text-sm font-semibold hover:bg-surface"
          >
            Aujourd'hui
          </button>
          <button
            type="button"
            onClick={goNext}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant bg-white hover:bg-surface"
            aria-label="Semaine suivante"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 text-secondary">
          Chargement de l'agenda...
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-7">
          {days.map((day) => {
            const iso = formatIso(day);
            const dayVisits = visits.filter((visit) => visit.scheduledDate === iso);
            const dayActivities = activities.filter(
              (activity) => activity.dueDate && activity.dueDate.startsWith(iso),
            );
            const isToday = formatIso(new Date()) === iso;
            return (
              <div
                key={iso}
                className={`flex min-h-[180px] flex-col gap-2 rounded-2xl border p-3 ${
                  isToday
                    ? "border-primary bg-primary/5"
                    : "border-outline-variant bg-surface-container-lowest"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className={`text-xs font-bold uppercase ${isToday ? "text-primary" : "text-secondary"}`}>
                    {formatDayHeader(day)}
                  </p>
                  <span className={`text-xs ${isToday ? "text-primary" : "text-secondary"}`}>
                    {dayVisits.length + dayActivities.length}
                  </span>
                </div>

                {dayVisits.length === 0 && dayActivities.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center text-[11px] text-secondary">
                    Rien
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {dayVisits
                      .sort((left, right) => left.startTime.localeCompare(right.startTime))
                      .map((visit) => (
                        <Link
                          key={visit.id}
                          to={`/visits/${visit.id}`}
                          className="rounded-lg border border-outline-variant bg-white p-2 text-xs transition-colors hover:bg-surface"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-on-surface">{visit.startTime}</p>
                            <Badge variant={visitStatusTone(visit.status)}>{visitStatusLabel[visit.status]}</Badge>
                          </div>
                          <p className="mt-1 truncate text-[11px] text-secondary">{visit.clientName}</p>
                        </Link>
                      ))}
                    {dayActivities.map((activity) => (
                      <div
                        key={activity.id}
                        className="rounded-lg border border-outline-variant bg-white p-2 text-xs"
                      >
                        <div className="flex items-center gap-1.5">
                          <CalendarDays className="h-3 w-3 text-secondary" />
                          <p className="font-semibold text-on-surface">{activity.subject}</p>
                        </div>
                        <p className="mt-0.5 text-[11px] text-secondary">{activity.type}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
