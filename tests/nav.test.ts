import { describe, it, expect } from "vitest";
import {
  TEACHER_NAV,
  DEFAULT_PINS,
  MAX_PINS,
  allItems,
  isActive,
  groupForPath,
  parsePins,
  togglePin,
  pinnedItems,
} from "@/lib/nav";

describe("TEACHER_NAV structure", () => {
  it("has no duplicate hrefs — a pin is keyed by href", () => {
    const hrefs = allItems().map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("keeps every group scannable", () => {
    // The whole point of the split: Learning used to hold 13 of 32 items, so
    // collapsing it hid a grab-bag instead of organising anything.
    for (const g of TEACHER_NAV) {
      expect(g.items.length, `${g.group} has ${g.items.length} items`).toBeLessThanOrEqual(8);
      expect(g.items.length, `${g.group} is empty`).toBeGreaterThan(0);
    }
  });

  it("has unique group names", () => {
    const names = TEACHER_NAV.map((g) => g.group);
    expect(new Set(names).size).toBe(names.length);
  });

  it("ships defaults that are all real items", () => {
    const known = new Set(allItems().map((i) => i.href));
    for (const p of DEFAULT_PINS) expect(known.has(p), p).toBe(true);
  });
});

describe("isActive", () => {
  it("matches an exact path", () => {
    expect(isActive("/attendance", "/attendance")).toBe(true);
  });

  it("matches a child route", () => {
    expect(isActive("/students", "/students/abc")).toBe(true);
    expect(isActive("/students", "/students/abc/portfolio")).toBe(true);
  });

  it("does not match a sibling with a shared prefix", () => {
    // The bug this guards: /grading must not light up on /gradebook, and
    // /pages must not light up on /paths.
    expect(isActive("/grading", "/gradebook")).toBe(false);
    expect(isActive("/pages", "/paths")).toBe(false);
    expect(isActive("/invoices", "/invites")).toBe(false);
  });

  it("keeps Dashboard exact-only, or it would match the whole console", () => {
    expect(isActive("/dashboard", "/dashboard")).toBe(true);
    expect(isActive("/dashboard", "/dashboard/anything")).toBe(false);
  });
});

describe("groupForPath — which accordion opens on load", () => {
  it("finds the group for a top-level route", () => {
    expect(groupForPath("/attendance")).toBe("Today");
    expect(groupForPath("/worksheets")).toBe("Teaching");
    expect(groupForPath("/mastery")).toBe("Progress");
    expect(groupForPath("/invoices")).toBe("Money");
    expect(groupForPath("/sources")).toBe("Admin");
  });

  it("finds the group from a nested route", () => {
    expect(groupForPath("/students/abc")).toBe("People");
    expect(groupForPath("/worksheets/xyz/print")).toBe("Teaching");
  });

  it("returns null for a page that isn't in the nav", () => {
    // The caller must then leave the accordion alone rather than collapsing
    // everything out from under the user.
    expect(groupForPath("/login")).toBeNull();
    expect(groupForPath("/")).toBeNull();
  });

  it("does not confuse siblings that share a prefix", () => {
    expect(groupForPath("/gradebook")).toBe("Progress");
    expect(groupForPath("/grading")).toBe("Today");
    expect(groupForPath("/paths")).toBe("Progress");
    expect(groupForPath("/pages")).toBe("Teaching");
  });
});

describe("parsePins", () => {
  it("reads a stored list", () => {
    expect(parsePins('["/attendance","/invoices"]')).toEqual(["/attendance", "/invoices"]);
  });

  it("falls back to defaults for missing or corrupt data", () => {
    expect(parsePins(null)).toEqual(DEFAULT_PINS);
    expect(parsePins("not json")).toEqual(DEFAULT_PINS);
    expect(parsePins('{"nope":1}')).toEqual(DEFAULT_PINS);
  });

  it("drops hrefs that are no longer real nav items", () => {
    // A removed feature must not leave a dead shortcut in someone's sidebar.
    expect(parsePins('["/attendance","/a-feature-we-deleted"]')).toEqual(["/attendance"]);
  });

  it("drops duplicates and respects the cap", () => {
    expect(parsePins('["/attendance","/attendance"]')).toEqual(["/attendance"]);
    const many = JSON.stringify(allItems().map((i) => i.href));
    expect(parsePins(many)).toHaveLength(MAX_PINS);
  });

  it("treats an explicitly empty list as empty, not as 'use defaults'", () => {
    // Unpinning everything is a real choice and must survive a reload.
    expect(parsePins("[]")).toEqual([]);
  });
});

describe("togglePin", () => {
  it("adds and removes", () => {
    expect(togglePin([], "/invoices")).toEqual(["/invoices"]);
    expect(togglePin(["/invoices"], "/invoices")).toEqual([]);
  });

  it("preserves order when removing from the middle", () => {
    expect(togglePin(["/a", "/attendance", "/b"], "/attendance")).toEqual(["/a", "/b"]);
  });

  it("appends to the end so the row doesn't reshuffle", () => {
    expect(togglePin(["/dashboard"], "/invoices")).toEqual(["/dashboard", "/invoices"]);
  });

  it("ignores an href that isn't a nav item", () => {
    expect(togglePin(["/dashboard"], "/not-a-page")).toEqual(["/dashboard"]);
  });

  it("refuses past the cap rather than silently dropping an existing pin", () => {
    const full = allItems().slice(0, MAX_PINS).map((i) => i.href);
    const extra = allItems()[MAX_PINS].href;
    expect(togglePin(full, extra)).toEqual(full);
    // Unpinning still works when full — otherwise you'd be stuck.
    expect(togglePin(full, full[0])).toHaveLength(MAX_PINS - 1);
  });
});

describe("pinnedItems", () => {
  it("resolves in pin order, not nav order", () => {
    const out = pinnedItems(["/invoices", "/attendance"]);
    expect(out.map((i) => i.href)).toEqual(["/invoices", "/attendance"]);
    expect(out[0].label).toBe("ESA invoices");
  });

  it("skips anything unresolvable instead of rendering a blank row", () => {
    expect(pinnedItems(["/attendance", "/gone"]).map((i) => i.href)).toEqual(["/attendance"]);
  });

  it("handles no pins", () => {
    expect(pinnedItems([])).toEqual([]);
  });
});
