import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeLeadSource,
  normalizePotential,
  buildFieldIntake,
  applyFieldIntakePatch,
  EMPTY_FIELD_INTAKE,
} from "../src/lib/prospect-intake.ts";

test("potential validator rejects unknown values to null", () => {
  assert.equal(normalizePotential("high"), "high");
  assert.equal(normalizePotential("huge"), null);
  assert.equal(normalizePotential(""), null);
});

test("lead source falls back to societe on unknown input", () => {
  assert.equal(normalizeLeadSource("rdv"), "rdv");
  assert.equal(normalizeLeadSource("societe"), "societe");
  assert.equal(normalizeLeadSource("nonsense"), "societe");
  assert.equal(normalizeLeadSource(undefined), "societe");
});

test("buildFieldIntake trims strings and validates the enum", () => {
  const intake = buildFieldIntake({
    address: "  12 rue de la Paix ",
    zone: "Centre",
    establishmentType: "Épicerie",
    potential: "medium",
    competitor: "Marque X",
  });
  assert.equal(intake.address, "12 rue de la Paix");
  assert.equal(intake.zone, "Centre");
  assert.equal(intake.potential, "medium");
  assert.equal(intake.competitor, "Marque X");
});

test("buildFieldIntake defaults missing fields", () => {
  assert.deepEqual(buildFieldIntake({}), EMPTY_FIELD_INTAKE);
  assert.deepEqual(buildFieldIntake(null), EMPTY_FIELD_INTAKE);
});

test("invalid dates normalize to null instead of throwing", () => {
  assert.equal(buildFieldIntake({ nextVisitAt: "not-a-date" }).nextVisitAt, null);
  assert.equal(buildFieldIntake({ nextVisitAt: "" }).nextVisitAt, null);
  assert.equal(buildFieldIntake({ nextVisitAt: "2026-07-02" }).nextVisitAt, "2026-07-02");
});

test("applyFieldIntakePatch only touches provided fields", () => {
  const current = { ...EMPTY_FIELD_INTAKE, address: "Adresse A", competitor: "Marque Y", potential: "low" as const };
  const patched = applyFieldIntakePatch(current, { competitor: "Marque Z" });
  assert.equal(patched.competitor, "Marque Z");
  assert.equal(patched.address, "Adresse A"); // untouched
  assert.equal(patched.potential, "low"); // untouched
});

test("applyFieldIntakePatch can clear an enum back to null", () => {
  const current = { ...EMPTY_FIELD_INTAKE, potential: "high" as const };
  const patched = applyFieldIntakePatch(current, { potential: "" });
  assert.equal(patched.potential, null);
});
