// Pure validation/normalization for the field-prospecting intake.
// Kept dependency-free and side-effect-free so it can be reused by the server
// handlers AND unit-tested without a database or an HTTP layer.

import {
  PROSPECT_POTENTIALS,
  PROSPECT_LEAD_SOURCES,
  type ProspectPotential,
  type ProspectLeadSource,
  type ProspectFieldIntake,
} from "../types.js";

type Body = Record<string, unknown> | null | undefined;

export const EMPTY_FIELD_INTAKE: ProspectFieldIntake = {
  address: "",
  zone: "",
  establishmentType: "",
  potential: null,
  competitor: "",
  nextVisitAt: null,
};

function asString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

/** Returns a valid ISO-ish date string, or null when absent/invalid. Never throws. */
function asDateOrNull(value: unknown): string | null {
  const s = asString(value);
  if (!s) return null;
  return Number.isNaN(Date.parse(s)) ? null : s;
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  const s = asString(value);
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}

function oneOfOrNull<T extends string>(allowed: readonly T[], value: unknown): T | null {
  const s = asString(value);
  return (allowed as readonly string[]).includes(s) ? (s as T) : null;
}

export function normalizePotential(value: unknown): ProspectPotential | null {
  return oneOfOrNull(PROSPECT_POTENTIALS, value);
}

export function normalizeLeadSource(value: unknown): ProspectLeadSource {
  return oneOf(PROSPECT_LEAD_SOURCES, value, "societe");
}

export function buildFieldIntake(body: Body): ProspectFieldIntake {
  const b = body ?? {};
  return {
    address: asString(b.address),
    zone: asString(b.zone),
    establishmentType: asString(b.establishmentType),
    potential: normalizePotential(b.potential),
    competitor: asString(b.competitor),
    nextVisitAt: asDateOrNull(b.nextVisitAt),
  };
}

/** PATCH variant: only the fields present in the body are updated; others are kept. */
export function applyFieldIntakePatch(current: ProspectFieldIntake, body: Body): ProspectFieldIntake {
  const b = body ?? {};
  const has = (key: string) => b[key] !== undefined;
  return {
    address: has("address") ? asString(b.address) : current.address,
    zone: has("zone") ? asString(b.zone) : current.zone,
    establishmentType: has("establishmentType") ? asString(b.establishmentType) : current.establishmentType,
    potential: has("potential") ? normalizePotential(b.potential) : current.potential,
    competitor: has("competitor") ? asString(b.competitor) : current.competitor,
    nextVisitAt: has("nextVisitAt") ? asDateOrNull(b.nextVisitAt) : current.nextVisitAt,
  };
}
