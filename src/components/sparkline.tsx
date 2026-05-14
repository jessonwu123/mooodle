interface Point {
  x: number; // unix ms
  y: number; // rating (0-5)
}

interface Props {
  points: Point[];
  width?: number;
  height?: number;
}

/**
 * 极简内联折线图：展示评分随时间的变化趋势。
 * 时间作为 x 轴（按时间顺序均匀分布），评分 0-5 作为 y 轴。
 */
export function Sparkline({ points, width = 140, height = 36 }: Props) {
  if (points.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">暂无趋势数据</div>
    );
  }
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const n = sorted.length;
  const padX = 2;
  const padY = 4;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const yMax = 5;
  const yMin = 0;
  const xy = sorted.map((p, i) => {
    const x = n === 1 ? padX + innerW / 2 : padX + (i / (n - 1)) * innerW;
    const y = padY + innerH - ((p.y - yMin) / (yMax - yMin)) * innerH;
    return [x, y] as const;
  });
  const d = xy
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const last = xy[xy.length - 1];
  const latestRating = sorted[sorted.length - 1].y;
  return (
    <div className="flex items-center gap-2">
      <svg
        width={width}
        height={height}
        className="overflow-visible"
        aria-label="评分趋势"
      >
        {/* baseline grid */}
        <line
          x1={padX}
          x2={width - padX}
          y1={height - padY}
          y2={height - padY}
          stroke="hsl(var(--border))"
          strokeDasharray="2 2"
        />
        {n > 1 && (
          <path
            d={d}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {xy.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={i === xy.length - 1 ? 2.5 : 1.5}
            fill="hsl(var(--primary))"
          />
        ))}
        <circle
          cx={last[0]}
          cy={last[1]}
          r={4}
          fill="hsl(var(--primary))"
          fillOpacity={0.2}
        />
      </svg>
      <span className="text-xs text-muted-foreground">
        {n} 次记录 · 当前 {latestRating}★
      </span>
    </div>
  );
}
