import { test as it } from "node:test";
import assert from "node:assert/strict";
import { parsePluginRating, NEW_RATING_DEFAULTS } from "./meeting-rating";

  it("allows saving with no performance or progress filled", () => {
    assert.deepEqual(parsePluginRating(undefined), { scores: {}, overall: undefined, overallProgress: undefined, items: [] });
    assert.deepEqual(parsePluginRating({ focus: "", overallProgress: "" }).scores, {});
  });
  it("keeps filled stars and progress", () => {
    const r = parsePluginRating({ focus: 4, overall: 3, overallProgress: 90, items: [{ item_name: " 分数 ", percentage: 70 }, { item_name: "" }] });
    assert.deepEqual(r.scores, { focus: 4 });
    assert.equal(r.overall, 3);
    assert.equal(r.overallProgress, 90);
    assert.deepEqual(r.items, [{ item_name: "分数", percentage: 70 }]);
  });
  it("rejects stars outside 1-5 and progress outside 0-100", () => {
    assert.throws(() => parsePluginRating({ focus: 6 }));
    assert.throws(() => parsePluginRating({ overallProgress: 101 }));
  });
  it("new ratings default to the website form values", () => {
    assert.equal(NEW_RATING_DEFAULTS.focus, 5); assert.equal(NEW_RATING_DEFAULTS.overall_assessment, 5); assert.equal(NEW_RATING_DEFAULTS.overall_progress, 80);
  });

