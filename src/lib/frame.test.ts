import { describe, it, expect } from "vitest";
import { analyze, rate, MEMBERS, STEEL_PRICE_PER_TON, RATING_ORDER } from "./frame";

describe("credit ratings", () => {
  it("under 0.5 is AAA", () => expect(rate(0.49)).toBe("AAA"));
  it("0.5–0.7 is AA/A", () => expect(["AA", "A"]).toContain(rate(0.65)));
  it("0.7–0.9 is BBB", () => expect(rate(0.8)).toBe("BBB"));
  it("0.9–1.0 is junk", () => expect(["BB", "B"]).toContain(rate(0.97)));
  it("over 1.0 is default", () => expect(rate(1.01)).toBe("D"));
});

describe("frame", () => {
  it("intact frame stands", () => expect(analyze([]).collapsed).toBe(false));
  it("end bays have HSS braces", () =>
    expect(MEMBERS.filter((m) => m.kind === "brace" && m.section.name.startsWith("HSS")).length).toBe(12));
  it("no single pull collapses the intact frame", () =>
    expect(MEMBERS.filter((m) => analyze([m.id]).collapsed)).toHaveLength(0));
  it("removing any single member keeps the building at A or better", () => {
    for (const m of MEMBERS) {
      const worst = Math.max(...Object.values(analyze([m.id]).results).map((r) => r.ratio));
      expect(RATING_ORDER.indexOf(rate(worst))).toBeLessThanOrEqual(RATING_ORDER.indexOf("A"));
    }
  });
  it("two adjacent columns on the same line collapse it", () =>
    expect(analyze(["C3-2", "C4-2"]).collapsed).toBe(true));
  it("two non-adjacent columns on the same line do not", () =>
    expect(analyze(["C2-2", "C5-2"]).collapsed).toBe(false));
  it("steel is $4,500 per ton", () => expect(STEEL_PRICE_PER_TON).toBe(4500));
});

describe("ground-column staging", () => {
  it("C1-1, C1-3, C1-2 go A → BBB → junk and only default from pull 5", async () => {
    const { analyze, rate } = await import("./frame");
    const seq = ["C1-1", "C1-3", "C1-2", "C1-4"];
    const got = seq.map((_, i) => analyze(seq.slice(0, i + 1)));
    expect(got.map((a) => rate(a.maxRatio))).toEqual(["A", "BBB", "B", "B"]);
    expect(got.every((a) => !a.collapsed)).toBe(true);
  });
});

describe("load path", () => {
  it("reroute tags only members whose load rose more than 15%", async () => {
    const { rerouted, loadOf } = await import("./frame");
    const a = analyze([]).results, b = analyze(["C1-2"]).results;
    const gains = rerouted(a, b);
    expect(gains.length).toBeGreaterThan(0);
    for (const g of gains) {
      const m = MEMBERS.find((x) => x.id === g.id)!;
      expect(loadOf(m, b[g.id]) / loadOf(m, a[g.id])).toBeGreaterThan(1.15);
    }
  });
});
