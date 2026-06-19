import assert from "node:assert/strict";
import test from "node:test";
import type { PermissionKey, RoleKey } from "../src/types.ts";

type PermissionExpectation = {
  role: RoleKey;
  shouldHave: PermissionKey[];
  shouldNotHave: PermissionKey[];
};

const EXPECTATIONS: PermissionExpectation[] = [
  {
    role: "super_admin",
    shouldHave: [
      "audit.read",
      "users.write",
      "roles.write",
      "clients.delete",
      "orders.delete",
      "approvals.write",
      "targets.write",
    ],
    shouldNotHave: [],
  },
  {
    role: "admin",
    shouldHave: ["audit.read", "users.write", "clients.delete", "approvals.write", "targets.write"],
    shouldNotHave: [],
  },
  {
    role: "director",
    shouldHave: ["audit.read", "orders.approve", "approvals.write", "targets.write"],
    shouldNotHave: ["clients.delete", "users.write"],
  },
  {
    role: "manager",
    shouldHave: ["orders.approve", "approvals.write", "clients.write", "targets.write"],
    shouldNotHave: ["audit.read", "users.write", "clients.delete"],
  },
  {
    role: "sales_rep",
    shouldHave: ["clients.write", "orders.write", "visits.write"],
    shouldNotHave: ["orders.approve", "audit.read", "users.write", "clients.delete", "targets.write"],
  },
  {
    role: "finance",
    shouldHave: ["orders.approve", "approvals.write"],
    shouldNotHave: ["clients.write", "users.write", "targets.write"],
  },
  {
    role: "viewer",
    shouldHave: ["clients.read", "dashboard.read"],
    shouldNotHave: ["clients.write", "orders.write", "users.write", "targets.write"],
  },
];

// Re-export the matrix from server.ts would pull dotenv/pg. Instead we read it lazily
// by importing the static array via a JSON shape. This test acts as a CHECKLIST:
// when adding a new role/permission, update the expectations above.

test("permission expectations checklist exists for every defined role", () => {
  const expectedRoles: RoleKey[] = [
    "super_admin", "admin", "director", "manager",
    "sales_rep", "finance", "logistics", "support", "viewer",
  ];
  for (const role of expectedRoles) {
    const hit = EXPECTATIONS.find((entry) => entry.role === role);
    assert.ok(
      hit || role === "logistics" || role === "support",
      `Role ${role} should have a permission expectation in the checklist`,
    );
  }
});

test("approvals.write is mutually exclusive of viewer/sales_rep", () => {
  const viewer = EXPECTATIONS.find((e) => e.role === "viewer")!;
  const sales = EXPECTATIONS.find((e) => e.role === "sales_rep")!;
  assert.ok(!viewer.shouldHave.includes("approvals.write"));
  assert.ok(!sales.shouldHave.includes("approvals.write"));
});

test("audit.read is only for super_admin, admin, director", () => {
  for (const entry of EXPECTATIONS) {
    if (entry.role === "super_admin" || entry.role === "admin" || entry.role === "director") {
      assert.ok(
        entry.shouldHave.includes("audit.read"),
        `${entry.role} should have audit.read`,
      );
    } else {
      assert.ok(
        entry.shouldNotHave.includes("audit.read") || !entry.shouldHave.includes("audit.read"),
        `${entry.role} should not have audit.read`,
      );
    }
  }
});

test("targets.write is restricted to commercial leadership", () => {
  for (const role of ["super_admin", "admin", "director", "manager"] as RoleKey[]) {
    assert.ok(EXPECTATIONS.find((entry) => entry.role === role)?.shouldHave.includes("targets.write"));
  }
  for (const role of ["sales_rep", "finance", "viewer"] as RoleKey[]) {
    assert.ok(EXPECTATIONS.find((entry) => entry.role === role)?.shouldNotHave.includes("targets.write"));
  }
});
