import { describe, it, expect } from "vitest";
import {
  parseAccent,
  accentOf,
  readableOn,
  accentIsLegible,
  brandOf,
  logoDataUri,
  DEFAULT_ACCENT,
} from "@/lib/branding";
import { contrastRatio, AA_NORMAL } from "@/lib/contrast";

describe("parseAccent", () => {
  it("accepts hex in the forms people actually type", () => {
    expect(parseAccent("#1F3A6E")).toBe("#1f3a6e");
    expect(parseAccent("1f3a6e")).toBe("#1f3a6e");
    expect(parseAccent("  #ABC  ")).toBe("#aabbcc");
  });

  it("refuses anything that is not a hex triple", () => {
    for (const bad of ["", "  ", "red", "rgb(1,2,3)", "#12", "#12345", "#1234567", "#12345g"]) {
      expect(parseAccent(bad), bad).toBeNull();
    }
  });

  it("refuses stylesheet injection that needs no angle brackets", () => {
    // This value is interpolated inside a <style> block, where HTML escaping
    // does nothing. Each of these is a working attack against a naive
    // implementation that merely escaped the string.
    const attacks = [
      "red;} body{display:none} .x{",
      "url(https://evil.example/track.png)",
      "#fff;background-image:url(//evil.example/pixel)",
      "expression(alert(1))",
      "#fff</style><script>alert(1)</script>",
      "var(--secret)",
    ];
    for (const a of attacks) expect(parseAccent(a), a).toBeNull();
  });

  it("falls back to the house colour rather than to nothing", () => {
    // An unparseable value must not yield an empty colour, which would render
    // as a broken declaration in the packet.
    expect(accentOf({ accentColor: "nonsense" })).toBe(DEFAULT_ACCENT);
    expect(accentOf({ accentColor: "" })).toBe(DEFAULT_ACCENT);
    expect(accentOf(null)).toBe(DEFAULT_ACCENT);
    expect(accentOf({ accentColor: "#7A1F1F" })).toBe("#7a1f1f");
  });
});

describe("readableOn", () => {
  it("puts light text on a dark accent and dark text on a light one", () => {
    expect(readableOn("#1f3a6e")).toBe("#ffffff");
    expect(readableOn("#f4e04d")).toBe("#141c26");
  });

  it("meets AA on any colour that admits a passing foreground", () => {
    // A school can change how the packet looks but cannot make its own
    // letterhead unreadable — for every colour where that is achievable.
    const colours = [
      "#1f3a6e", "#ffffff", "#000000", "#c8e64b", "#7a1f1f",
      "#0d5c3a", "#ffd7e8", "#2b2b2b", "#4a0072", "#fff9e6",
    ];
    for (const c of colours) {
      expect(accentIsLegible(c), `${c} should admit a passing foreground`).toBe(true);
      expect(contrastRatio(readableOn(c), c), c).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it("still picks the better of the two when neither can pass", () => {
    // Mid-greys top out around 4.3:1 against both black and white, so no
    // choice reaches AA. readableOn promises the BEST available foreground,
    // not a passing one — accentIsLegible is what reports the shortfall, and
    // conflating the two would mean either lying or returning nothing to
    // render.
    const grey = "#808080";
    expect(accentIsLegible(grey)).toBe(false);
    const chosen = readableOn(grey);
    const other = chosen === "#ffffff" ? "#141c26" : "#ffffff";
    expect(contrastRatio(chosen, grey)).toBeGreaterThanOrEqual(contrastRatio(other, grey));
  });

  it("reports mid-greys as not legible rather than pretending", () => {
    // Around #808080 neither black nor white clears 4.5:1. The honest answer is
    // "this colour can't carry body text", which the UI warns about — silently
    // shipping a failing contrast would undo 8.1.
    expect(accentIsLegible("#808080")).toBe(false);
    expect(accentIsLegible("#1f3a6e")).toBe(true);
    expect(accentIsLegible("not a colour")).toBe(false);
  });
});

describe("logoDataUri", () => {
  const png = { mime: "image/png", data: new Uint8Array([137, 80, 78, 71]) };

  it("inlines a raster logo so a saved PDF still shows it", () => {
    expect(logoDataUri(png)).toBe("data:image/png;base64,iVBORw==");
  });

  it("refuses SVG", () => {
    // An SVG is a document that can carry script, and this gets embedded into
    // a page we generate and hand to a state reviewer.
    expect(logoDataUri({ mime: "image/svg+xml", data: new Uint8Array([60, 115]) })).toBeNull();
    expect(logoDataUri({ mime: "text/html", data: new Uint8Array([60]) })).toBeNull();
  });
});

describe("brandOf", () => {
  it("assembles what a letterhead needs", () => {
    const b = brandOf(
      { name: "Cedar Grove", address: "12 Vine St", accentColor: "#7A1F1F" },
      { mime: "image/png", data: new Uint8Array([137, 80, 78, 71]) }
    );
    expect(b.schoolName).toBe("Cedar Grove");
    expect(b.accent).toBe("#7a1f1f");
    expect(b.onAccent).toBe("#ffffff");
    expect(b.logo?.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("never fills a surface with a colour that cannot carry text", () => {
    // The accent is free to rule a border at any value — a line has no text on
    // it. A FILL does, so an illegible accent falls back to the house colour
    // there. Without this split, a grey accent would put 4.3:1 text in the
    // action bar and quietly undo the AA work from 8.1.
    const grey = brandOf({ name: "S", accentColor: "#808080" }, null);
    expect(grey.accent).toBe("#808080"); // still rules the letterhead
    expect(grey.surface).toBe(DEFAULT_ACCENT); // but does not get filled behind text
    expect(contrastRatio(grey.onSurface, grey.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it("uses the school's own colour for surfaces when it can carry text", () => {
    const ok = brandOf({ name: "S", accentColor: "#1F4A36" }, null);
    expect(ok.surface).toBe("#1f4a36");
    expect(contrastRatio(ok.onSurface, ok.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it("survives a school with no branding at all", () => {
    const b = brandOf({ name: "New School" }, null);
    expect(b.accent).toBe(DEFAULT_ACCENT);
    expect(b.logo).toBeNull();
    expect(b.address).toBe("");
  });
});
