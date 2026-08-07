import { describe, it, expect } from "vitest";
import {
  verificationFor,
  tallyReasons,
  taxonomyQuality,
  CONFIRM_PAID_CYCLES,
  type Observation,
} from "@/lib/observations";

const ob = (o: Partial<Observation> & { outcome: string }): Observation => ({
  railId: "classwallet",
  reasonRaw: "",
  reasonKey: "",
  observedAt: "2026-08-01T00:00:00.000Z",
  ...o,
});

const paid = (n: number) => Array.from({ length: n }, () => ob({ outcome: "paid" }));

describe("verificationFor — what clears a ⚑ flag", () => {
  it("calls a rail unverified until money has actually landed", () => {
    expect(verificationFor([]).level).toBe("unverified");
    // Approvals are not payments. A state can approve and still not pay.
    expect(verificationFor([ob({ outcome: "approved" }), ob({ outcome: "approved" })]).level).toBe(
      "unverified"
    );
  });

  it("does not let rejections alone imply the rules are understood", () => {
    const v = verificationFor([ob({ outcome: "rejected" }), ob({ outcome: "rejected" })]);
    expect(v.level).toBe("unverified");
    expect(v.rejected).toBe(2);
    expect(v.detail).toContain("still a guess");
  });

  it("moves to observed on the first payment and reports progress honestly", () => {
    const v = verificationFor(paid(1));
    expect(v.level).toBe("observed");
    expect(v.label).toBe(`Observed 1/${CONFIRM_PAID_CYCLES}`);
    expect(v.progress).toBeCloseTo(1 / CONFIRM_PAID_CYCLES);
  });

  it("only confirms at the payment threshold, not one short of it", () => {
    expect(verificationFor(paid(CONFIRM_PAID_CYCLES - 1)).level).toBe("observed");
    expect(verificationFor(paid(CONFIRM_PAID_CYCLES)).level).toBe("confirmed");
    expect(verificationFor(paid(CONFIRM_PAID_CYCLES)).progress).toBe(1);
  });

  it("counts decided cycles as paid + rejected, ignoring pending approvals", () => {
    const v = verificationFor([...paid(2), ob({ outcome: "rejected" }), ob({ outcome: "approved" })]);
    expect(v.decided).toBe(3);
    expect(v.approved).toBe(1);
  });
});

const PREDICTED = [
  "Service dates outside the approved billing period",
  "Missing curriculum reference for the subject billed",
];

describe("tallyReasons", () => {
  it("counts a filed reason against the prediction it was filed under", () => {
    const t = tallyReasons(
      [
        ob({ outcome: "rejected", reasonKey: PREDICTED[0], reasonRaw: "Dates are outside the window." }),
        ob({ outcome: "rejected", reasonKey: PREDICTED[0], reasonRaw: "Service dates not in period" }),
      ],
      PREDICTED
    );
    expect(t).toHaveLength(1);
    expect(t[0].count).toBe(2);
    expect(t[0].novel).toBe(false);
    // Both verbatim wordings survive — the portal rarely words it the same way
    // twice and the variants are the useful part.
    expect(t[0].samples).toHaveLength(2);
  });

  it("flags a reason nobody predicted as novel", () => {
    const t = tallyReasons(
      [ob({ outcome: "rejected", reasonRaw: "Provider licence expired" })],
      PREDICTED
    );
    expect(t[0].novel).toBe(true);
    expect(t[0].reason).toBe("Provider licence expired");
  });

  it("groups novel wordings differing only in case, spacing or trailing period", () => {
    const t = tallyReasons(
      [
        ob({ outcome: "rejected", reasonRaw: "Provider licence expired" }),
        ob({ outcome: "rejected", reasonRaw: "provider  licence   expired." }),
      ],
      PREDICTED
    );
    expect(t).toHaveLength(1);
    expect(t[0].count).toBe(2);
    expect(t[0].samples).toHaveLength(2); // grouped, but neither wording is lost
  });

  it("does not merge genuinely different rejections", () => {
    const t = tallyReasons(
      [
        ob({ outcome: "rejected", reasonRaw: "Provider licence expired" }),
        ob({ outcome: "rejected", reasonRaw: "Provider licence missing" }),
      ],
      PREDICTED
    );
    expect(t).toHaveLength(2);
  });

  it("ignores non-rejections and empty reasons", () => {
    expect(
      tallyReasons(
        [ob({ outcome: "paid", reasonRaw: "n/a" }), ob({ outcome: "rejected", reasonRaw: "  " })],
        PREDICTED
      )
    ).toEqual([]);
  });

  it("tracks the most recent sighting even when rows arrive out of order", () => {
    const t = tallyReasons(
      [
        ob({ outcome: "rejected", reasonRaw: "Late", observedAt: "2026-09-01T00:00:00.000Z" }),
        ob({ outcome: "rejected", reasonRaw: "Late", observedAt: "2026-07-01T00:00:00.000Z" }),
      ],
      PREDICTED
    );
    expect(t[0].lastSeen).toBe("2026-09-01T00:00:00.000Z");
  });

  it("ranks by frequency, breaking ties toward the unpredicted reason", () => {
    const t = tallyReasons(
      [
        ob({ outcome: "rejected", reasonKey: PREDICTED[0] }),
        ob({ outcome: "rejected", reasonRaw: "Provider licence expired" }),
      ],
      PREDICTED
    );
    expect(t[0].novel).toBe(true);
  });
});

describe("taxonomyQuality — how good the guess in rules.ts turned out to be", () => {
  it("separates predictions that happened, predictions that never did, and surprises", () => {
    const q = taxonomyQuality(
      [
        ob({ outcome: "rejected", reasonKey: PREDICTED[0] }),
        ob({ outcome: "rejected", reasonRaw: "Provider licence expired" }),
      ],
      PREDICTED
    );
    expect(q.hit).toEqual([PREDICTED[0]]);
    expect(q.unseen).toEqual([PREDICTED[1]]);
    expect(q.novel.map((n) => n.reason)).toEqual(["Provider licence expired"]);
  });

  it("reports every prediction as unseen before anything has been observed", () => {
    const q = taxonomyQuality([], PREDICTED);
    expect(q.unseen).toEqual(PREDICTED);
    expect(q.hit).toEqual([]);
    expect(q.novel).toEqual([]);
  });
});
