import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * 将带有 $...$ / $$...$$ LaTeX 的文本渲染为 HTML。
 * 失败时回退到原始文本。
 */
export function MathText({
  text,
  className,
  block = false,
}: {
  text: string | null | undefined;
  className?: string;
  block?: boolean;
}) {
  const html = useMemo(() => {
    const src = text ?? "";
    if (!src) return "";
    // 拆分 $$...$$ 和 $...$
    const parts: Array<{ type: "text" | "inline" | "block"; value: string }> = [];
    const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    // 文本段内识别裸 LaTeX（如 133\frac{1}{3}、\sqrt{2}、\text{...}），自动按数学渲染
    const bareLatexRe = /(\d+)?\\[a-zA-Z]+(?:\s*\{[^{}]*\}|\s*\[[^\]]*\]){0,4}/g;
    const pushText = (txt: string) => {
      let li = 0;
      let mm: RegExpExecArray | null;
      bareLatexRe.lastIndex = 0;
      while ((mm = bareLatexRe.exec(txt))) {
        if (mm.index > li) parts.push({ type: "text", value: txt.slice(li, mm.index) });
        parts.push({ type: "inline", value: mm[0] });
        li = mm.index + mm[0].length;
      }
      if (li < txt.length) parts.push({ type: "text", value: txt.slice(li) });
    };
    while ((m = re.exec(src))) {
      if (m.index > lastIndex) pushText(src.slice(lastIndex, m.index));
      if (m[1] != null) parts.push({ type: "block", value: m[1] });
      else if (m[2] != null) parts.push({ type: "inline", value: m[2] });
      lastIndex = m.index + m[0].length;
    }
    if (lastIndex < src.length) pushText(src.slice(lastIndex));

    const escape = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    return parts
      .map((p) => {
        if (p.type === "text") return escape(p.value);
        try {
          return katex.renderToString(p.value, {
            throwOnError: false,
            displayMode: p.type === "block",
            output: "html",
          });
        } catch {
          return escape(p.value);
        }
      })
      .join("");
  }, [text]);

  const Tag = block ? "div" : "span";
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
