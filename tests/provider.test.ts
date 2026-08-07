// The school's provider identity.
//
// Half of these tests are about arithmetic. The other half are about what this
// feature is forbidden from claiming — Cohort cannot check a provider ID
// against any administrator, because every marketplace is behind the school's
// own login, so nothing here may render as a verification Cohort performed.
// That constraint is a sentence in a comment until a test enforces it.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ADMINISTRATORS,
  ATTESTATION_DAYS,
  administratorFor,
  daysUntilStale,
  looksLikeProviderId,
  packetProviderLine,
  providerStatus,
  providerSummary,
} from "@/lib/provider";
import { RAILS } from "@/lib/rules";

const TODAY = "2026-08-07";
const id = (over: Partial<Parameters<typeof providerStatus>[0]> = {}) => ({
  providerId: "CW-90210",
  providerRail: "classwallet",
  providerAttestedAt: TODAY,
  ...over,
});

describe("administrators line up with the rails they belong to", () => {
  it("names an administrator for every rail in rules.ts", () => {
    // A school on a rail with no administrator entry would be shown a field it
    // cannot fill in.
    for (const rail of Object.keys(RAILS)) {
      expect(administratorFor(rail), rail).not.toBeNull();
    }
  });

  it("invents no administrator for a rail that does not exist", () => {
    expect(administratorFor("bank-of-nowhere")).toBeNull();
    expect(administratorFor("")).toBeNull();
  });

  it("gives every administrator a label for its own ID field", () => {
    // The school is copying a number off someone else's screen; the field has
    // to be called what that screen calls it.
    for (const a of ADMINISTRATORS) {
      expect(a.idLabel.length, a.rail).toBeGreaterThan(2);
      expect(a.hint.length, a.rail).toBeGreaterThan(10);
    }
  });
});

describe("status is derived from the two fields that hold the truth", () => {
  it("is none with nothing recorded", () => {
    expect(providerStatus(id({ providerId: "" }), TODAY)).toBe("none");
    expect(providerStatus(id({ providerId: "   " }), TODAY)).toBe("none");
    expect(providerStatus(id({ providerRail: "" }), TODAY)).toBe("none");
  });

  it("is stale when an ID was recorded but nobody stood behind it", () => {
    expect(providerStatus(id({ providerAttestedAt: null }), TODAY)).toBe("stale");
  });

  it("is attested inside the window and stale past it", () => {
    expect(providerStatus(id({ providerAttestedAt: "2026-08-07" }), TODAY)).toBe("attested");
    // 180 days before today, exactly on the boundary.
    expect(providerStatus(id({ providerAttestedAt: "2026-02-08" }), TODAY)).toBe("attested");
    expect(providerStatus(id({ providerAttestedAt: "2026-02-07" }), TODAY)).toBe("stale");
    expect(providerStatus(id({ providerAttestedAt: "2024-01-01" }), TODAY)).toBe("stale");
  });

  it("treats a future-dated attestation as stale rather than fresh", () => {
    // A clock skew or a typo'd year must not buy 180 extra days of silence.
    expect(providerStatus(id({ providerAttestedAt: "2027-01-01" }), TODAY)).toBe("stale");
  });

  it("counts down to staleness, and past it", () => {
    expect(daysUntilStale(id({ providerAttestedAt: TODAY }), TODAY)).toBe(ATTESTATION_DAYS);
    expect(daysUntilStale(id({ providerAttestedAt: "2026-02-07" }), TODAY)).toBeLessThan(0);
    expect(daysUntilStale(id({ providerId: "" }), TODAY)).toBeNull();
    expect(daysUntilStale(id({ providerAttestedAt: null }), TODAY)).toBeNull();
  });
});

describe("what goes on the packet", () => {
  it("names the administrator and the number", () => {
    expect(packetProviderLine(id())).toBe("ClassWallet provider ID: CW-90210");
  });

  it("prints nothing at all when there is no ID", () => {
    // An empty "Provider ID:" label on a reimbursement packet reads as a number
    // that was withheld, which is worse than no line.
    expect(packetProviderLine(id({ providerId: "" }))).toBe("");
    expect(packetProviderLine(id({ providerId: "  " }))).toBe("");
  });

  it("still prints the number when the rail is unrecognised", () => {
    // Losing the school's ID off the packet because we don't know the
    // administrator would cost them the cycle. Degrade, don't drop.
    expect(packetProviderLine(id({ providerRail: "who-knows" }))).toBe("Provider ID: CW-90210");
  });
});

describe("the summary attributes the claim to a person", () => {
  it("says who confirmed it and when", () => {
    const s = providerSummary(id(), TODAY, "Sarah Whitfield");
    expect(s).toContain("2026-08-07");
    expect(s).toContain("Sarah Whitfield");
  });

  it("asks again once it is stale", () => {
    expect(providerSummary(id({ providerAttestedAt: "2024-01-01" }), TODAY)).toMatch(/still active/i);
  });

  it("says plainly when nothing is recorded", () => {
    expect(providerSummary(id({ providerId: "" }), TODAY)).toMatch(/no provider id/i);
  });
});

describe("Cohort never claims to have checked this itself", () => {
  // The load-bearing constraint. Every marketplace is behind the school's own
  // login, so a "Verified Provider" badge would be a representation about
  // public money that nobody at Cohort is in a position to make.
  const files = [
    "src/lib/provider.ts",
    "src/app/(teacher)/settings/page.tsx",
    "src/app/(teacher)/actions.ts",
  ];

  const code = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

  it.each(files)("%s never renders the word verified about a provider", (path) => {
    const src = code(readFileSync(join(process.cwd(), path), "utf8"));
    // Look only at user-facing string literals mentioning a provider.
    const strings = [...src.matchAll(/"([^"\\]{12,})"|'([^'\\]{12,})'/g)].map((m) => m[1] ?? m[2]);
    const bad = strings.filter(
      (s) => /provider/i.test(s) && /\bverif(y|ied|ication)\b/i.test(s)
    );
    expect(bad, `\n${bad.join("\n")}\n`).toEqual([]);
  });

  it("the lib says out loud that it cannot check", () => {
    const doc = readFileSync(join(process.cwd(), "src/lib/provider.ts"), "utf8");
    expect(doc).toMatch(/cannot verify|no public directory|behind a login/i);
  });
});

describe("looksLikeProviderId is a sanity check, not a format rule", () => {
  it("accepts the shapes real IDs plausibly take", () => {
    for (const v of ["CW-90210", "1234567", "az-esa-00042", "SUFS/9912", "a1b2c3"]) {
      expect(looksLikeProviderId(v), v).toBe(true);
    }
  });

  it("rejects an empty or obviously-wrong paste", () => {
    for (const v of ["", "  ", "ab", "https://app.classwallet.com/vendor/1", "me@school.org"]) {
      expect(looksLikeProviderId(v), v).toBe(false);
    }
  });

  it("does not enforce a made-up format", () => {
    // We do not know any administrator's format. Rejecting a real number is the
    // failure that costs an invoice cycle, so the check stays loose on purpose.
    expect(looksLikeProviderId("0000000000000001")).toBe(true);
    expect(looksLikeProviderId("Cedar Grove Learning Collective LLC")).toBe(true);
  });
});

describe("no administrator link points somewhere a school shouldn't be sent", () => {
  it("uses https or nothing", () => {
    for (const a of ADMINISTRATORS) {
      if (a.confirmAt === "") continue; // state direct: no single portal
      expect(a.confirmAt, a.rail).toMatch(/^https:\/\//);
    }
  });
});

// Guard on the guard: if the whole provider surface were deleted, the
// honesty tests above would pass by scanning nothing.
describe("the feature is actually wired up", () => {
  function tsxFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(join(process.cwd(), dir))) {
      if (name === "generated") continue;
      const rel = join(dir, name);
      if (statSync(join(process.cwd(), rel)).isDirectory()) tsxFiles(rel, out);
      else if (name.endsWith(".tsx") || name.endsWith(".ts")) out.push(rel);
    }
    return out;
  }

  it("something outside the lib and its test imports it", () => {
    const users = tsxFiles("src").filter((f) =>
      readFileSync(join(process.cwd(), f), "utf8").includes("@/lib/provider")
    );
    expect(users.length, `imported by:\n${users.join("\n")}`).toBeGreaterThanOrEqual(2);
  });
});
