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
import type { Sibling } from "@/services/consultingAgentApi";

interface PriorityMatrixProps {
  siblings: Sibling[];
  current: { impact: number | null; speed: number | null } | null;
  currentTitle?: string;
  sheetNum?: string;
}

interface ChartPoint {
  x: number;
  y: number;
  title: string;
  quadrant: string;
  isCurrent: boolean;
}

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border bg-card px-3 py-2 shadow-md text-xs">
      <div className="font-semibold text-foreground">{p.title}</div>
      <div className="text-muted-foreground mt-1 font-mono tabular-nums">
        impact {p.y.toFixed(2)} · speed {p.x.toFixed(2)}
      </div>
      <div className="text-[9px] uppercase tracking-[0.18em] text-primary mt-1 font-mono font-bold">
        {p.quadrant}
      </div>
    </div>
  );
};

export const PriorityMatrix = ({
  siblings,
  current,
  currentTitle,
  sheetNum = "03",
}: PriorityMatrixProps) => {
  const siblingPoints: ChartPoint[] = siblings.map((s) => ({
    x: s.axes.speed,
    y: s.axes.impact,
    title: s.title,
    quadrant: s.quadrant,
    isCurrent: false,
  }));

  const currentPoint: ChartPoint[] =
    current && current.impact !== null && current.speed !== null
      ? [
          {
            x: current.speed,
            y: current.impact,
            title: currentTitle || "Current assessment",
            quadrant: "in progress",
            isCurrent: true,
          },
        ]
      : [];

  return (
    <section className="joseph-sheet">
      <span className="joseph-sheet__num">{sheetNum}</span>
      <div className="joseph-sheet__title">
        <span className="joseph-sheet__title-text">Placement matrix</span>
        <span className="ml-auto text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground">
          impact × speed
        </span>
      </div>

      <div className="joseph-matrix-wrap">
        <div className="joseph-matrix-corners" aria-hidden>
          <i />
          <i />
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 14, bottom: 24, left: 0 }}>
              <CartesianGrid
                strokeDasharray="2 4"
                stroke="hsl(var(--border))"
                opacity={0.55}
              />

              <ReferenceArea
                x1={3.67} x2={5} y1={3.67} y2={5}
                fill="hsl(var(--primary))" fillOpacity={0.05}
              />
              <ReferenceArea
                x1={1} x2={3.66} y1={3.67} y2={5}
                fill="hsl(var(--primary))" fillOpacity={0.025}
              />

              <ReferenceLine x={2.33} stroke="hsl(var(--border))" strokeDasharray="3 6" />
              <ReferenceLine x={3.67} stroke="hsl(var(--primary))" strokeOpacity={0.4} strokeDasharray="3 6" />
              <ReferenceLine y={2.33} stroke="hsl(var(--border))" strokeDasharray="3 6" />
              <ReferenceLine y={3.67} stroke="hsl(var(--primary))" strokeOpacity={0.4} strokeDasharray="3 6" />

              <XAxis
                type="number"
                dataKey="x"
                domain={[1, 5]}
                ticks={[1, 2, 3, 4, 5]}
                tick={{
                  fontSize: 9,
                  fontFamily: "ui-monospace, SFMono-Regular, monospace",
                  fill: "hsl(var(--muted-foreground))",
                }}
                stroke="hsl(var(--border))"
                axisLine={{ stroke: "hsl(var(--border))" }}
                label={{
                  value: "SPEED →",
                  position: "insideBottom",
                  offset: -12,
                  style: {
                    fontSize: 9,
                    fontFamily: "ui-monospace, SFMono-Regular, monospace",
                    letterSpacing: "0.22em",
                    fill: "hsl(var(--muted-foreground))",
                  },
                }}
              />
              <YAxis
                type="number"
                dataKey="y"
                domain={[1, 5]}
                ticks={[1, 2, 3, 4, 5]}
                tick={{
                  fontSize: 9,
                  fontFamily: "ui-monospace, SFMono-Regular, monospace",
                  fill: "hsl(var(--muted-foreground))",
                }}
                stroke="hsl(var(--border))"
                axisLine={{ stroke: "hsl(var(--border))" }}
                label={{
                  value: "IMPACT →",
                  angle: -90,
                  position: "insideLeft",
                  offset: 14,
                  style: {
                    fontSize: 9,
                    fontFamily: "ui-monospace, SFMono-Regular, monospace",
                    letterSpacing: "0.22em",
                    fill: "hsl(var(--muted-foreground))",
                  },
                }}
              />
              <ZAxis range={[70, 70]} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<CustomTooltip />} />

              <Scatter
                name="siblings"
                data={siblingPoints}
                fill="hsl(var(--muted-foreground))"
                fillOpacity={0.55}
              />
              {currentPoint.length > 0 && (
                <Scatter
                  name="current"
                  data={currentPoint}
                  fill="hsl(var(--primary))"
                  shape="star"
                />
              )}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="joseph-matrix-key">
        <div className="joseph-matrix-key__cell"><strong>NE</strong> Accelerators</div>
        <div className="joseph-matrix-key__cell" style={{ justifyContent: "flex-end" }}>
          <strong>NW</strong> Transformational
        </div>
        <div className="joseph-matrix-key__cell"><strong>SE</strong> Quick Wins</div>
        <div className="joseph-matrix-key__cell" style={{ justifyContent: "flex-end" }}>
          <strong>SW</strong> Incremental Growth
        </div>
      </div>
    </section>
  );
};
