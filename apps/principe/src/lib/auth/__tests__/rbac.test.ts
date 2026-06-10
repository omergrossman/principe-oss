import { describe, it, expect } from "vitest";
import {
  defineRole,
  resolvePermissions,
  hasPermission,
  requirePermission,
  RBACError,
} from "@principe/rbac";

// The base roles (principe.member < admin < founder) are registered on import.
describe("RBAC permission resolution", () => {
  it("resolves inherited permissions up the base-role DAG", () => {
    const founder = resolvePermissions("principe.founder");
    expect(founder.has("tenant.read")).toBe(true); // inherited from admin
    expect(founder.has("tenant.delete")).toBe(true); // own
    expect(founder.has("billing.manage")).toBe(true);
  });

  it("scopes permissions to the role's level", () => {
    expect(hasPermission("principe.member", "tenant.read")).toBe(false);
    expect(hasPermission("principe.admin", "tenant.read")).toBe(true);
    expect(hasPermission("principe.admin", "tenant.delete")).toBe(false);
  });

  it("requirePermission throws RBACError only when the permission is missing", () => {
    expect(() => requirePermission("principe.member", "tenant.delete")).toThrow(RBACError);
    expect(() => requirePermission("principe.founder", "tenant.delete")).not.toThrow();
  });

  it("is cycle-safe (no infinite loop on mutual inheritance)", () => {
    defineRole({ id: "test.a", inherits: ["test.b"], permissions: ["a.x"] });
    defineRole({ id: "test.b", inherits: ["test.a"], permissions: ["b.y"] });
    const p = resolvePermissions("test.a");
    expect(p.has("a.x")).toBe(true);
    expect(p.has("b.y")).toBe(true);
  });

  it("returns an empty set for an unknown role", () => {
    expect(resolvePermissions("does.not.exist").size).toBe(0);
  });
});
