import { test } from "node:test";
import assert from "node:assert/strict";
import katex from "katex";
import { normalizeMathDisplay } from "./math-display";

test("2003 AMC8 Q14 array accepts KaTeX without changing its arithmetic", () => {
  const source = String.raw`\begin{array}{r@{\quad}c@{\quad}c@{\quad}c} & T & W & O \\ + & T & W & O \\ \hline F & O & U & R \end{array}`;
  assert.throws(() => katex.renderToString(source, { throwOnError: true }), /Unknown column alignment/);
  const normalized = normalizeMathDisplay(source);
  assert.equal(normalized, String.raw`\begin{array}{rccc} & T & W & O \\ + & T & W & O \\ \hline F & O & U & R \end{array}`);
  assert.doesNotThrow(() => katex.renderToString(normalized, { throwOnError: true, displayMode: true }));
});

test("ordinary arrays and non-spacing column inserts remain unchanged", () => {
  for (const source of [String.raw`\begin{array}{r|cc}a&b&c\end{array}`, String.raw`\begin{array}{r@{+}c}a&b\end{array}`, String.raw`x+\frac{1}{2}`]) {
    assert.equal(normalizeMathDisplay(source), source);
  }
});