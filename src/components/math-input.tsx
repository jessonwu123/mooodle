import { useEffect, useRef, useState } from "react";
import { Delete, ChevronLeft, ChevronRight } from "lucide-react";
import { MathText } from "@/components/math-text";

type MF = HTMLElement & {
  value: string;
  insert: (latex: string, opts?: Record<string, unknown>) => boolean;
  executeCommand: (cmd: unknown) => boolean;
  focus: () => void;
  mathVirtualKeyboardPolicy: string;
  smartFence: boolean;
  menuItems: unknown[];
};

type Key = { label: string; insert?: string; cmd?: string; clear?: boolean; wide?: boolean; accent?: boolean };

// 符号区（上方）
const SYMBOL_KEYS: Key[] = [
  { label: "$x^2$", insert: "#@^2" },
  { label: "$x^{\\square}$", insert: "#@^{#?}" },
  { label: "$\\sqrt{\\square}$", insert: "\\sqrt{#0}" },
  { label: "$\\sqrt[\\square]{\\square}$", insert: "\\sqrt[#?]{#0}" },
  { label: "$\\frac{\\square}{\\square}$", insert: "\\frac{#@}{#?}" },
  { label: "$\\square\\frac{\\square}{\\square}$", insert: "#?\\frac{#?}{#?}" },
  { label: "$\\le$", insert: "\\le" },
  { label: "$\\ge$", insert: "\\ge" },
  { label: "$\\pi$", insert: "\\pi" },
  { label: "$a$", insert: "a" },
  { label: "$b$", insert: "b" },
  { label: "$z$", insert: "z" },
];

// 主键盘（4 行 x 7 列）
const MAIN_KEYS: Key[] = [
  { label: "(", insert: "(" }, { label: "<", insert: "<" }, { label: "7", insert: "7" }, { label: "8", insert: "8" }, { label: "9", insert: "9" }, { label: "÷", insert: "\\div" }, { label: "AC", clear: true, accent: true },
  { label: ")", insert: ")" }, { label: ">", insert: ">" }, { label: "4", insert: "4" }, { label: "5", insert: "5" }, { label: "6", insert: "6" }, { label: "×", insert: "\\times" }, { label: "$x$", insert: "x" },
  { label: "，", insert: "," }, { label: "←", cmd: "moveToPreviousChar" }, { label: "1", insert: "1" }, { label: "2", insert: "2" }, { label: "3", insert: "3" }, { label: "−", insert: "-" }, { label: "$y$", insert: "y" },
  { label: "→", cmd: "moveToNextChar" }, { label: "⌫", cmd: "deleteBackward" }, { label: ".", insert: "." }, { label: "0", insert: "0" }, { label: "=", insert: "=" }, { label: "+", insert: "+" }, { label: "$z$", insert: "z" },
];

let mathliveLoaded: Promise<void> | null = null;
function loadMathlive() {
  if (!mathliveLoaded) {
    mathliveLoaded = import("mathlive").then((m: any) => {
      const MFE = m.MathfieldElement;
      MFE.fontsDirectory = "https://cdn.jsdelivr.net/npm/mathlive@0.107.0/fonts/";
      MFE.soundsDirectory = null;
    });
  }
  return mathliveLoaded;
}

export function MathInput({
  value,
  onChange,
  disabled,
  active,
  onFocus,
}: {
  value: string;
  onChange: (latex: string) => void;
  disabled?: boolean;
  active: boolean;
  onFocus: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mfRef = useRef<MF | null>(null);
  const [ready, setReady] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;

  useEffect(() => {
    let cancelled = false;
    loadMathlive().then(() => {
      if (cancelled || !hostRef.current) return;
      const mf = document.createElement("math-field") as MF;
      mf.mathVirtualKeyboardPolicy = "manual";
      mf.smartFence = true;
      mf.style.width = "100%";
      mf.style.minHeight = "48px";
      mf.style.fontSize = "22px";
      mf.style.padding = "6px 10px";
      mf.style.border = "none";
      mf.style.background = "transparent";
      mf.style.outline = "none";
      mf.value = value;
      mf.addEventListener("input", () => onChangeRef.current(mf.value));
      mf.addEventListener("focusin", () => onFocusRef.current());
      hostRef.current.appendChild(mf);
      try { mf.menuItems = []; } catch { /* ignore */ }
      mfRef.current = mf;
      setReady(true);
    });
    return () => {
      cancelled = true;
      mfRef.current?.remove();
      mfRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const mf = mfRef.current;
    if (mf) {
      if (disabled) mf.setAttribute("read-only", "");
      else mf.removeAttribute("read-only");
    }
  }, [disabled, ready]);

  const press = (k: Key) => {
    const mf = mfRef.current;
    if (!mf || disabled) return;
    if (k.clear) mf.value = "";
    else if (k.cmd) mf.executeCommand(k.cmd);
    else if (k.insert) mf.insert(k.insert, { selectionMode: "placeholder", focus: true });
    mf.focus();
    onChangeRef.current(mf.value);
  };

  const btn = (k: Key, i: number) => (
    <button
      key={i}
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => press(k)}
      className={[
        "flex h-11 items-center justify-center rounded-md border border-border text-base transition-colors active:scale-95",
        k.accent ? "bg-primary/10 text-primary hover:bg-primary/20" : "bg-background hover:bg-accent",
      ].join(" ")}
    >
      {k.label.startsWith("$") ? <MathText text={k.label} /> : k.label}
    </button>
  );

  return (
    <div className="space-y-2">
      <div
        className={[
          "flex items-center rounded-lg border bg-background",
          active && !disabled ? "border-primary ring-2 ring-primary/20" : "border-border",
        ].join(" ")}
        onClick={() => { mfRef.current?.focus(); onFocus(); }}
      >
        <span className="pl-3 text-sm text-muted-foreground">答：</span>
        <div ref={hostRef} className="min-h-12 flex-1" />
        {!ready && <span className="pr-3 text-xs text-muted-foreground">加载中…</span>}
      </div>
      {active && !disabled && (
        <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-2">
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">{SYMBOL_KEYS.map(btn)}</div>
          <div className="grid grid-cols-7 gap-1.5">{MAIN_KEYS.map(btn)}</div>
          <p className="flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
            <ChevronLeft className="h-3 w-3" /><ChevronRight className="h-3 w-3" />移动光标 · <Delete className="h-3 w-3" />删除 · 多个解用逗号隔开，如 x=1，y=2
          </p>
        </div>
      )}
    </div>
  );
}
