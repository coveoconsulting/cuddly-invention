import assert from "node:assert/strict";
import test from "node:test";
import {
  PLAN_FEATURES,
  PLAN_LABELS,
  planHasFeature,
  type SubscriptionPlan,
} from "../src/types.ts";

test("every subscription plan has a label and at least one feature", () => {
  const plans = Object.keys(PLAN_FEATURES) as SubscriptionPlan[];
  assert.deepEqual(plans.sort(), Object.keys(PLAN_LABELS).sort());
  for (const plan of plans) {
    assert.ok(PLAN_LABELS[plan]);
    assert.ok(PLAN_FEATURES[plan].length > 0);
  }
});

test("enterprise-grade plans expose advanced platform features", () => {
  assert.equal(planHasFeature("enterprise", "assistant_ai"), true);
  assert.equal(planHasFeature("enterprise", "advanced_reports"), true);
  assert.equal(planHasFeature("enterprise", "unlimited_integrations"), true);
  assert.equal(planHasFeature("sur_mesure", "automations"), true);
});

test("essential plan covers core field-sales workflow plus quotes/whatsapp/AI/reports", () => {
  assert.equal(planHasFeature("essentiel", "contacts"), true);
  assert.equal(planHasFeature("essentiel", "orders"), true);
  assert.equal(planHasFeature("essentiel", "quotes"), true);
  assert.equal(planHasFeature("essentiel", "whatsapp"), true);
  assert.equal(planHasFeature("essentiel", "assistant_ai"), true);
  assert.equal(planHasFeature("essentiel", "advanced_reports"), true);
  assert.equal(planHasFeature("essentiel", "automations"), false);
  assert.equal(planHasFeature(undefined, "contacts"), false);
});
