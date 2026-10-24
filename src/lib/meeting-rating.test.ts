import { describe, expect, it } from "vitest";
import { parsePluginRating, NEW_RATING_DEFAULTS } from "./meeting-rating";

describe("plugin rating input", () => {
  it("allows saving with no performance or progress filled", () => {
    expect(parsePluginRating(undefined)).toEqual({ scores: {}, overall: undefined, overallProgress: undefined, items: [] });
    expect(parsePluginRating({ focus: "", overallProgress: "" }).scores).toEqual({});
  });
  it("keeps filled stars and progress", () => {
    const r = parsePluginRating({ focus: 4, overall: 3, overallProgress: 90, items: [{ item_name: " 分数 ", percentage: 70 }, { item_name: "" }] });
    expect(r.scores).toEqual({ focus: 4 });
    expect(r.overall).toBe(3);
    expect(r.overallProgress).toBe(90);
    expect(r.items).toEqual([{ item_name: "分数", percentage: 70 }]);
  });
  it("rejects stars outside 1-5 and progress outside 0-100", () => {
    expect(() => parsePluginRating({ focus: 6 })).toThrow();
    expect(() => parsePluginRating({ overallProgress: 101 })).toThrow();
  });
  it("new ratings default to the website form values", () => {
    expect(NEW_RATING_DEFAULTS).toMatchObject({ focus: 5, overall_assessment: 5, overall_progress: 80 });
  });
});
