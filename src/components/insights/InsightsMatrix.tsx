import {
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { InsightAssessment } from "@/services/consultingAgentApi";

interface InsightsMatrixProps {
  assessments: InsightAssessment[];
  activeId?: string | null;
  onPointClick?: (a: InsightAssessment) => void;
  quadrantCounts?: Partial<Record<string, number>>;
}

interface MatrixPoint {
  x: number;
  y: number;
  title: string;
  quadrant: string;
  sponsor: string;
  status: string;
  id: string;
  isActive: boolean;
  isFresh: boolean;
}

const MatrixTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: MatrixPoint }[];
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="insights-tip">
      <div className="insights-tip__title">{p.title}</div>
      <div className="insights-tip__sponsor">{p.sponsor}</div>
      <div className="insights-tip__row">
        <span>Impact</span>
        <strong>{p.y.toFixed(2)}</strong>
        <span className="insights-tip__sep" />
        <span>Speed</span>
        <strong>{p.x.toFixed(2)}</strong>
      </div>
      <div className="insights-tip__tag">{p.quadrant}</div>
    </div>
  );
};

export const InsightsMatrix = ({
  assessments,
  activeId,
  onPointClick,
  quadrantCounts,
}: InsightsMatrixProps) => {
  const points: MatrixPoint[] = assessments.map((a) => ({
    x: a.axes.speed,
    y: a.axes.impact,
    title: a.title,
    quadrant: a.quadrant,
    sponsor: a.sponsor,
    status: a.status,
    id: a.id,
    isActive: a.id === activeId,
    isFresh: !!a.is_fresh,
  }));

  const others = points.filter((p) => !p.isActive && !p.isFresh);
  const fresh = points.filter((p) => p.isFresh && !p.isActive);
  const active = points.filter((p) => p.isActive);

  const handleClick = (data: { payload?: MatrixPoint }) => {
    if (data?.payload && onPointClick) {
      const original = assessments.find((a) => a.id === data.payload!.id);
      if (original) onPointClick(original);
    }
  };

  // Single render of a dot with a soft halo via SVG filter
  return (
    <div className="insights-board">
      {/* Soft glow filter for dots, defined once */}
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <filter id="insights-dot-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="insights-dot-glow-active" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      {/* Quadrant labels — positioned at the four visual corners of the
          chart, with counts matching the dots that actually appear in
          each corner.

          Visual mapping vs. framework names:
            NW (top-left,    impact↑ speed↓) = Accelerator + Transformational
            NE (top-right,   impact↑ speed↑) = Quick Win
            SE (bottom-right impact↓ speed↑) = Incremental Growth
            SW (bottom-left, impact↓ speed↓) = Defer
       */}
      <div className="insights-board__labels" aria-hidden>
        <span className="insights-board__label insights-board__label--nw">
          <span className="insights-board__label-name">Transformational</span>
          {quadrantCounts && (
            <span className="insights-board__label-count">
              {(quadrantCounts["Transformational Value"] ?? 0) + (quadrantCounts.Accelerator ?? 0)}
            </span>
          )}
        </span>
        <span className="insights-board__label insights-board__label--ne">
          <span className="insights-board__label-name">Accelerators</span>
          {quadrantCounts && (
            <span className="insights-board__label-count">
              {quadrantCounts["Quick Win"] ?? 0}
            </span>
          )}
        </span>
        <span className="insights-board__label insights-board__label--sw">
          <span className="insights-board__label-name">Incremental Growth</span>
          {quadrantCounts && (
            <span className="insights-board__label-count">
              {quadrantCounts.Defer ?? 0}
            </span>
          )}
        </span>
        <span className="insights-board__label insights-board__label--se">
          <span className="insights-board__label-name">Quick Wins</span>
          {quadrantCounts && (
            <span className="insights-board__label-count">
              {quadrantCounts["Incremental Growth"] ?? 0}
            </span>
          )}
        </span>
      </div>

      <div className="insights-board__chart">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 24, right: 32, bottom: 48, left: 16 }}>
            <CartesianGrid
              strokeDasharray="1 6"
              stroke="hsl(var(--foreground) / 0.10)"
              opacity={0.7}
            />

            {/* Subtle wash on the Quick Win quadrant — the only quadrant
                that gets a colored emphasis; everything else stays neutral
                so the data does the talking. */}
            <ReferenceArea
              x1={3.67}
              x2={5}
              y1={3.67}
              y2={5}
              fill="hsl(var(--primary))"
              fillOpacity={0.07}
            />

            <ReferenceLine
              x={2.33}
              stroke="hsl(var(--foreground) / 0.12)"
              strokeDasharray="3 8"
            />
            <ReferenceLine
              x={3.67}
              stroke="hsl(var(--primary))"
              strokeOpacity={0.45}
              strokeWidth={1.5}
            />
            <ReferenceLine
              y={2.33}
              stroke="hsl(var(--foreground) / 0.12)"
              strokeDasharray="3 8"
            />
            <ReferenceLine
              y={3.67}
              stroke="hsl(var(--primary))"
              strokeOpacity={0.45}
              strokeWidth={1.5}
            />

            <XAxis
              type="number"
              dataKey="x"
              domain={[1, 5]}
              ticks={[1, 2, 3, 4, 5]}
              tick={{
                fontSize: 11,
                fill: "hsl(var(--muted-foreground))",
              }}
              stroke="hsl(var(--border))"
              axisLine={{ stroke: "hsl(var(--border))" }}
              tickLine={{ stroke: "hsl(var(--border))" }}
              label={{
                value: "Speed to value →",
                position: "insideBottom",
                offset: -24,
                style: {
                  fontSize: 11,
                  letterSpacing: "0.04em",
                  fill: "hsl(var(--muted-foreground))",
                  fontWeight: 500,
                },
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[1, 5]}
              ticks={[1, 2, 3, 4, 5]}
              tick={{
                fontSize: 11,
                fill: "hsl(var(--muted-foreground))",
              }}
              stroke="hsl(var(--border))"
              axisLine={{ stroke: "hsl(var(--border))" }}
              tickLine={{ stroke: "hsl(var(--border))" }}
              label={{
                value: "Business impact →",
                angle: -90,
                position: "insideLeft",
                offset: 22,
                style: {
                  fontSize: 11,
                  letterSpacing: "0.04em",
                  fill: "hsl(var(--muted-foreground))",
                  fontWeight: 500,
                },
              }}
            />
            <ZAxis range={[260, 260]} />
            <Tooltip cursor={{ strokeDasharray: "2 5", stroke: "hsl(var(--primary) / 0.4)" }} content={<MatrixTooltip />} />

            {/* Soft, rounded dots with glow halos */}
            <Scatter
              name="others"
              data={others}
              fill="hsl(var(--primary))"
              fillOpacity={0.45}
              stroke="hsl(var(--primary))"
              strokeOpacity={0.6}
              strokeWidth={1.5}
              onClick={handleClick}
              style={{ cursor: "pointer", filter: "url(#insights-dot-glow)" }}
            />
            {fresh.length > 0 && (
              <Scatter
                name="fresh"
                data={fresh}
                fill="hsl(var(--primary))"
                shape="star"
                onClick={handleClick}
                style={{ cursor: "pointer", filter: "url(#insights-dot-glow-active)" }}
              />
            )}
            {active.length > 0 && (
              <Scatter
                name="active"
                data={active}
                fill="hsl(var(--primary))"
                stroke="hsl(var(--card))"
                strokeWidth={3}
                onClick={handleClick}
                style={{ cursor: "pointer", filter: "url(#insights-dot-glow-active)" }}
              />
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
