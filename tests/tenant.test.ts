import { describe, it, expect } from "vitest";
import {
  slugify,
  isUsableSlug,
  availableSlug,
  slugFromHost,
  tenantOrigin,
  RESERVED_SLUGS,
  MAX_SLUG_LENGTH,
} from "@/lib/tenant";

describe("slugify", () => {
  it("turns a school name into a DNS label", () => {
    expect(slugify("Cedar Grove Learning Collective")).toBe("cedar-grove-learning-collective");
    expect(slugify("St. Mary's Microschool")).toBe("st-marys-microschool");
    expect(slugify("  Oak   Hill  ")).toBe("oak-hill");
  });

  it("keeps letters that carry accents rather than dropping them", () => {
    // "Peña" losing its n would give "pea", which is a different word.
    expect(slugify("Peña Academy")).toBe("pena-academy");
    expect(slugify("École Montessori")).toBe("ecole-montessori");
  });

  it("never produces a label DNS would reject", () => {
    for (const name of [
      "---Weird---",
      "!!!",
      "A",
      "Ω",
      "school & co.",
      "  -leading and trailing-  ",
      "many    spaces    here",
    ]) {
      const s = slugify(name);
      if (s === "") continue; // refusing is a valid answer
      expect(s, name).toMatch(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
      expect(s.length, name).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    }
  });

  it("refuses rather than inventing a name it cannot derive", () => {
    // A caller can prompt for something else; a made-up slug would be a
    // permanent public identifier nobody chose.
    expect(slugify("!!!")).toBe("");
    expect(slugify("A")).toBe("");
    expect(slugify("")).toBe("");
  });

  it("truncates long names without leaving a trailing hyphen", () => {
    const s = slugify("The " + "Very ".repeat(40) + "Long School");
    expect(s.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("isUsableSlug", () => {
  it("rejects every reserved name", () => {
    for (const r of RESERVED_SLUGS) expect(isUsableSlug(r), r).toBe(false);
  });

  it("rejects the mail-shaped names specifically", () => {
    // The reason this list exists at all: a tenant holding mail.<domain> or
    // autodiscover.<domain> can intercept mail and mail-based verification.
    for (const r of ["mail", "smtp", "mx", "autodiscover", "dkim", "dmarc"]) {
      expect(isUsableSlug(r), r).toBe(false);
    }
  });

  it("rejects malformed labels", () => {
    for (const bad of ["-lead", "trail-", "has space", "UPPER", "under_score", "dot.dot", "ab", ""]) {
      expect(isUsableSlug(bad), bad).toBe(false);
    }
  });

  it("rejects an all-digit label", () => {
    expect(isUsableSlug("12345")).toBe(false);
    expect(isUsableSlug("school2")).toBe(true);
  });
});

describe("availableSlug", () => {
  it("takes the plain slug when it is free", () => {
    expect(availableSlug("Oak Hill", [])).toBe("oak-hill");
  });

  it("suffixes around a collision", () => {
    expect(availableSlug("Oak Hill", ["oak-hill"])).toBe("oak-hill-2");
    expect(availableSlug("Oak Hill", ["oak-hill", "oak-hill-2"])).toBe("oak-hill-3");
  });

  it("routes around a reserved name instead of failing", () => {
    // A school genuinely called "Support" should still be able to sign up.
    expect(availableSlug("Support", [])).toBe("support-2");
  });

  it("keeps a suffixed slug inside the DNS label limit", () => {
    const long = "b".repeat(70);
    const s = availableSlug(long, [long.slice(0, MAX_SLUG_LENGTH)])!;
    expect(s.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(s).toMatch(/-2$/);
  });

  it("gives up rather than looping forever", () => {
    const taken = ["oak-hill", ...Array.from({ length: 98 }, (_, i) => `oak-hill-${i + 2}`)];
    expect(availableSlug("Oak Hill", taken)).toBeNull();
  });

  it("returns null for a name it cannot slugify", () => {
    expect(availableSlug("!!!", [])).toBeNull();
  });
});

describe("slugFromHost", () => {
  const ROOT = "cohort.school";

  it("reads the tenant off a subdomain", () => {
    expect(slugFromHost("cedar-grove.cohort.school", ROOT)).toBe("cedar-grove");
    expect(slugFromHost("CEDAR-GROVE.COHORT.SCHOOL", ROOT)).toBe("cedar-grove");
    expect(slugFromHost("cedar-grove.cohort.school:3000", ROOT)).toBe("cedar-grove");
  });

  it("returns null for the apex and www — those are the marketing site", () => {
    expect(slugFromHost("cohort.school", ROOT)).toBeNull();
    expect(slugFromHost("www.cohort.school", ROOT)).toBeNull();
  });

  it("refuses a host that is not under the root domain", () => {
    // The Host header is attacker-controlled. A lookalike domain must not
    // resolve to a tenant just because it ends in something similar.
    expect(slugFromHost("cedar-grove.evil.com", ROOT)).toBeNull();
    expect(slugFromHost("cedar-grove.cohort.school.evil.com", ROOT)).toBeNull();
    expect(slugFromHost("notcohort.school", ROOT)).toBeNull();
    // A suffix match that isn't a label boundary — "xcohort.school" ends with
    // "cohort.school" as a string but is a different domain.
    expect(slugFromHost("xcohort.school", ROOT)).toBeNull();
  });

  it("refuses a multi-label subdomain rather than guessing", () => {
    expect(slugFromHost("a.b.cohort.school", ROOT)).toBeNull();
  });

  it("refuses a reserved or malformed label", () => {
    expect(slugFromHost("mail.cohort.school", ROOT)).toBeNull();
    expect(slugFromHost("-bad.cohort.school", ROOT)).toBeNull();
  });

  it("handles missing input without throwing", () => {
    expect(slugFromHost(null, ROOT)).toBeNull();
    expect(slugFromHost(undefined, ROOT)).toBeNull();
    expect(slugFromHost("", ROOT)).toBeNull();
    expect(slugFromHost("cedar-grove.cohort.school", "")).toBeNull();
  });

  it("works on localhost for development", () => {
    expect(slugFromHost("cedar-grove.localhost:3000", "localhost")).toBe("cedar-grove");
    expect(slugFromHost("localhost:3000", "localhost")).toBeNull();
  });
});

describe("tenantOrigin", () => {
  it("builds the school's own origin", () => {
    expect(tenantOrigin("cedar-grove", "cohort.school")).toBe("https://cedar-grove.cohort.school");
    expect(tenantOrigin("cedar-grove", "localhost:3000", "http")).toBe(
      "http://cedar-grove.localhost:3000"
    );
  });

  it("round-trips with slugFromHost", () => {
    const origin = tenantOrigin("oak-hill", "cohort.school");
    const host = origin.replace("https://", "");
    expect(slugFromHost(host, "cohort.school")).toBe("oak-hill");
  });
});
