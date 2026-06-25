import { useEffect, useMemo, useState } from "react";
import {
  X,
  FileText,
  FileType,
  ArrowRight,
  Calendar,
  User,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  exportReport,
  type InsightAssessment,
  type SubScoreKey,
} from "@/services/consultingAgentApi";
import { QuadrantChip } from "./QuadrantChip";

interface AssessmentOverride {
  quadrant: string;
  impact: number;
  speed: number;
}

interface ReportSideSheetProps {
  assessment: InsightAssessment | null;
  onClose: () => void;
  onQuadrantOverride?: (id: string, override: AssessmentOverride | null) => void;
}

const SUB_SCORE_LABELS: { key: SubScoreKey; label: string; group: "impact" | "speed" }[] = [
  { key: "financial",     label: "Financial impact",    group: "impact" },
  { key: "productivity",  label: "Productivity scale",  group: "impact" },
  { key: "intent",        label: "Business intent",     group: "impact" },
  { key: "complexity",    label: "Implementation",      group: "speed" },
  { key: "data_platform", label: "Data & platform",     group: "speed" },
  { key: "measurement",   label: "Measurement",         group: "speed" },
];

const IMPACT_KEYS: SubScoreKey[] = ["financial", "productivity", "intent"];
const SPEED_KEYS: SubScoreKey[] = ["complexity", "data_platform", "measurement"];

const ZERO_SCORES = SUB_SCORE_LABELS.reduce(
  (acc, s) => ({ ...acc, [s.key]: 0 }),
  {} as Record<SubScoreKey, number>,
);

const avgOf = (keys: SubScoreKey[], scores: Record<SubScoreKey, number>): number => {
  const vals = keys.map((k) => scores[k]).filter((v) => typeof v === "number" && v > 0);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
};

// Mirror of the backend quadrant logic (consulting_state.quadrant) so leadership
// edits re-place the case live without a round-trip.
const computeQuadrant = (impact: number, speed: number): string => {
  const impactBand = impact >= 3.67 ? "high" : impact >= 2.34 ? "medium" : "low";
  const speedBand = speed >= 3.67 ? "high" : speed >= 2.34 ? "medium" : "low";
  if (impact >= 4.5 && speedBand === "low") return "Transformational Value";
  if (impactBand === "high" && speedBand === "high") return "Quick Win";
  if (impactBand === "high" && speedBand === "medium") return "Accelerator";
  if ((impactBand === "medium" || impactBand === "low") && speedBand === "high")
    return "Incremental Growth";
  return "Defer";
};

const bandOf = (v: number): "high" | "mid" | "low" =>
  v >= 3.67 ? "high" : v >= 2.34 ? "mid" : "low";

// Dummy "agent" rationale per sub-score, keyed by band. Stands in for a real
// model call — it reacts to the slider so leadership sees a defensible reason
// for wherever they move the score.
const RATIONALE: Record<SubScoreKey, Record<"high" | "mid" | "low", string>> = {
  financial: {
    high: "Modelled annual value lands in the $2M–$10M+ band — strong cost-out plus capacity creation, though the upper figures still lean on vendor math.",
    mid: "Annual value sits in the $500k–$2M band on the stated savings — real, but not yet transformational.",
    low: "Annual value reads below $500k or is still unquantified — hard to justify a top placement without a firmer number.",
  },
  productivity: {
    high: "Touches a full function or multiple teams — a BU-wide process, so the productivity leverage is broad.",
    mid: "Affects one team or a partial workflow — meaningful but contained.",
    low: "Hits only a few people or a thin slice of their work — limited reach.",
  },
  intent: {
    high: "Backed by a senior sponsor and a stated org or regulatory priority — clear top-down pull.",
    mid: "A function-level priority with a director-grade sponsor — supported, not mandated.",
    low: "Nice-to-have with no strong sponsor — easily deprioritised.",
  },
  complexity: {
    high: "Mostly configuration with light change management — quick to stand up.",
    mid: "A standard build with one or two integrations — a real but bounded project.",
    low: "Novel work or heavy change management — a multi-quarter lift.",
  },
  data_platform: {
    high: "Data is clean and accessible and the platform already supports it — little groundwork needed.",
    mid: "Data is reachable with effort and the platform covers the core — some gaps to close.",
    low: "Data is missing or fragmented, or the platform isn't ready — foundational work first.",
  },
  measurement: {
    high: "Metric and baseline are already tracked — success is cleanly measurable, close to A/B-able.",
    mid: "A metric exists but the baseline is noisy — measurable with care.",
    low: "No clear metric or baseline yet — hard to prove the win.",
  },
};

// Minimal markdown renderer — headings, lists, tables, bold, code.
// Same parsing approach used in ConsultingAgent for chat bubbles. Inlined
// here so the side sheet stays self-contained.
const renderInline = (text: string, keyPrefix: string) => {
  const parts: (string | JSX.Element)[] = [];
  let remaining = text;
  let i = 0;
  const pattern =
    /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))|(https?:\/\/[^\s)]+)/;
  while (remaining.length) {
    const m = remaining.match(pattern);
    if (!m || m.index === undefined) {
      parts.push(remaining);
      break;
    }
    if (m.index > 0) parts.push(remaining.slice(0, m.index));
    if (m[1]) parts.push(<strong key={`${keyPrefix}-b-${i}`}>{m[2]}</strong>);
    else if (m[3])
      parts.push(
        <code
          key={`${keyPrefix}-c-${i}`}
          className="font-mono text-[12px] bg-primary/[0.07] text-primary px-1 rounded"
        >
          {m[4]}
        </code>,
      );
    else if (m[5])
      parts.push(
        <a
          key={`${keyPrefix}-l-${i}`}
          href={m[7]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline inline-flex items-center gap-0.5"
        >
          {m[6]}
          <ExternalLink className="w-2.5 h-2.5" />
        </a>,
      );
    else if (m[8])
      parts.push(
        <a
          key={`${keyPrefix}-u-${i}`}
          href={m[8]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline break-all"
        >
          {m[8]}
        </a>,
      );
    remaining = remaining.slice(m.index + m[0].length);
    i += 1;
  }
  return parts;
};

const renderMarkdown = (md: string) => {
  const lines = md.split("\n");
  const out: JSX.Element[] = [];
  let buffer: string[] = [];
  let listBuffer: string[] = [];
  let tableBuffer: string[] = [];
  let inTable = false;
  let key = 0;

  const flushParagraph = () => {
    if (buffer.length) {
      out.push(
        <p key={`p-${key++}`} className="mb-3 last:mb-0 leading-relaxed text-[13.5px]">
          {renderInline(buffer.join(" "), `p${key}`)}
        </p>,
      );
      buffer = [];
    }
  };
  const flushList = () => {
    if (listBuffer.length) {
      out.push(
        <ul
          key={`ul-${key++}`}
          className="list-disc list-outside pl-5 mb-3 space-y-1 text-[13.5px]"
        >
          {listBuffer.map((item, ix) => (
            <li key={ix}>{renderInline(item, `li-${key}-${ix}`)}</li>
          ))}
        </ul>,
      );
      listBuffer = [];
    }
  };
  const flushTable = () => {
    if (!tableBuffer.length) return;
    const rows = tableBuffer
      .map((line) => line.split("|").slice(1, -1).map((c) => c.trim()))
      .filter((r) => r.length > 0);
    if (rows.length < 2) {
      tableBuffer = [];
      return;
    }
    const [header, _divider, ...body] = rows;
    out.push(
      <div key={`tbl-${key++}`} className="insights-report__table-wrap">
        <table className="insights-report__table">
          <thead>
            <tr>
              {header.map((h, hi) => (
                <th key={hi}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri}>
                {row.map((c, ci) => (
                  <td key={ci}>{renderInline(c, `td-${ri}-${ci}`)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    tableBuffer = [];
  };

  for (const line of lines) {
    const t = line;
    if (t.startsWith("|") && t.endsWith("|")) {
      if (!inTable) {
        flushParagraph();
        flushList();
        inTable = true;
      }
      tableBuffer.push(t);
      continue;
    } else if (inTable) {
      flushTable();
      inTable = false;
    }

    const stripped = t.trim();
    if (!stripped) {
      flushParagraph();
      flushList();
      continue;
    }
    if (stripped.startsWith("# ")) {
      flushParagraph();
      flushList();
      out.push(
        <h2
          key={`h-${key++}`}
          className="font-mono text-[11px] font-bold tracking-[0.22em] uppercase text-primary mt-5 mb-2"
        >
          {stripped.slice(2)}
        </h2>,
      );
      continue;
    }
    if (stripped.startsWith("## ")) {
      flushParagraph();
      flushList();
      out.push(
        <h3
          key={`h2-${key++}`}
          className="font-mono text-[10.5px] font-bold tracking-[0.22em] uppercase text-foreground/80 mt-4 mb-2 insights-report__h3"
        >
          {stripped.slice(3)}
        </h3>,
      );
      continue;
    }
    if (stripped.startsWith("### ")) {
      flushParagraph();
      flushList();
      out.push(
        <h4
          key={`h3-${key++}`}
          className="font-mono text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground mt-3 mb-1"
        >
          {stripped.slice(4)}
        </h4>,
      );
      continue;
    }
    if (stripped.startsWith("- ") || stripped.startsWith("* ")) {
      flushParagraph();
      listBuffer.push(stripped.slice(2));
      continue;
    }
    if (stripped === "---") {
      flushParagraph();
      flushList();
      out.push(<hr key={`hr-${key++}`} className="insights-report__rule" />);
      continue;
    }
    flushList();
    buffer.push(stripped);
  }
  flushParagraph();
  flushList();
  flushTable();
  return out;
};

export const ReportSideSheet = ({ assessment, onClose, onQuadrantOverride }: ReportSideSheetProps) => {
  const open = assessment !== null;

  // Leadership-adjustable scores. Seeded from the agent's assessment; reset
  // whenever a different case is opened. Local only — a "what-if" overlay, not
  // persisted back to the stored assessment.
  const [scores, setScores] = useState<Record<SubScoreKey, number>>(ZERO_SCORES);
  useEffect(() => {
    setScores({ ...ZERO_SCORES, ...(assessment?.sub_scores ?? {}) });
  }, [assessment?.id]);

  const liveImpact = useMemo(() => avgOf(IMPACT_KEYS, scores), [scores]);
  const liveSpeed = useMemo(() => avgOf(SPEED_KEYS, scores), [scores]);
  const liveQuadrant = useMemo(
    () => computeQuadrant(liveImpact, liveSpeed),
    [liveImpact, liveSpeed],
  );
  const adjusted = useMemo(
    () =>
      !!assessment &&
      SUB_SCORE_LABELS.some(
        ({ key }) => scores[key] !== (assessment.sub_scores?.[key] ?? 0),
      ),
    [scores, assessment],
  );
  const resetScores = () =>
    setScores({ ...ZERO_SCORES, ...(assessment?.sub_scores ?? {}) });

  // Notify parent whenever leadership scores differ — passes updated quadrant
  // AND updated axes so the matrix dot moves to the correct position.
  useEffect(() => {
    if (!assessment || !onQuadrantOverride) return;
    if (adjusted) {
      onQuadrantOverride(assessment.id, {
        quadrant: liveQuadrant,
        impact: liveImpact,
        speed: liveSpeed,
      });
    } else {
      onQuadrantOverride(assessment.id, null);
    }
  }, [liveQuadrant, liveImpact, liveSpeed, adjusted, assessment?.id]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const rendered = useMemo(
    () => (assessment?.report_markdown ? renderMarkdown(assessment.report_markdown) : []),
    [assessment?.report_markdown],
  );

  const handleExport = async (format: "pdf" | "docx") => {
    if (!assessment?.report_markdown) {
      toast.error("No report content for this assessment.");
      return;
    }
    try {
      const { blob, downloadFilename } = await exportReport(
        assessment.report_markdown,
        format,
        assessment.title?.toLowerCase().replace(/\s+/g, "-"),
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadFilename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} downloaded.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  return (
    <>
      {open && (
        <div className="insights-sheet__scrim" onClick={onClose} aria-hidden />
      )}
      <aside
        className={`insights-sheet ${open ? "insights-sheet--open" : ""}`}
        aria-hidden={!open}
      >
        {assessment && (
          <>
            <div className="insights-sheet__topbar">
              <span className="insights-sheet__topbar-eyebrow">
                <span className="insights-sheet__topbar-dot" />
                Assessment report
              </span>
              <button
                type="button"
                className="insights-sheet__close"
                onClick={onClose}
                aria-label="Close report"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="insights-sheet__hero">
              <div className="insights-sheet__hero-meta">
                <QuadrantChip quadrant={assessment.quadrant} size="md" />
                {assessment.is_fresh && (
                  <span className="insights-sheet__fresh-chip">Just added</span>
                )}
              </div>
              <h1 className="insights-sheet__title">{assessment.title}</h1>
              <div className="insights-sheet__hero-line">
                <span className="insights-sheet__hero-meta-row">
                  <User className="w-3 h-3 opacity-70" />
                  {assessment.sponsor}
                </span>
                {assessment.assessed_at && (
                  <span className="insights-sheet__hero-meta-row">
                    <Calendar className="w-3 h-3 opacity-70" />
                    {assessment.assessed_at.slice(0, 10)}
                  </span>
                )}
              </div>
              <div className="insights-sheet__hero-rule" />
            </div>

            <div className="insights-sheet__scroll">
              {/* Scoring breakdown — leadership can drag each score to adjust */}
              <section className="insights-sheet__section">
                <div className="insights-sheet__section-title">
                  <span className="insights-sheet__section-num">01</span>
                  Scoring breakdown
                  {adjusted && <span className="insights-sheet__whatif">what-if</span>}
                </div>

                <div className="insights-sheet__axis-grid">
                  <div className="insights-sheet__axis">
                    <div className="insights-sheet__axis-label">Impact</div>
                    <div className="insights-sheet__axis-value">
                      {liveImpact.toFixed(2)}
                    </div>
                    {adjusted &&
                      Math.abs(liveImpact - assessment.axes.impact) >= 0.005 && (
                        <div className="insights-sheet__axis-delta">
                          was {assessment.axes.impact.toFixed(2)}
                        </div>
                      )}
                  </div>
                  <div className="insights-sheet__axis">
                    <div className="insights-sheet__axis-label">Speed</div>
                    <div className="insights-sheet__axis-value">
                      {liveSpeed.toFixed(2)}
                    </div>
                    {adjusted &&
                      Math.abs(liveSpeed - assessment.axes.speed) >= 0.005 && (
                        <div className="insights-sheet__axis-delta">
                          was {assessment.axes.speed.toFixed(2)}
                        </div>
                      )}
                  </div>
                </div>

                <div className="insights-sheet__placement">
                  <span className="insights-sheet__placement-label">Placement</span>
                  <ArrowRight className="w-3 h-3 opacity-50" />
                  <QuadrantChip quadrant={liveQuadrant} size="sm" />
                  {adjusted && liveQuadrant !== assessment.quadrant && (
                    <span className="insights-sheet__placement-was">
                      was {assessment.quadrant}
                    </span>
                  )}
                </div>

                <div className="insights-sheet__sliders">
                  {SUB_SCORE_LABELS.map(({ key, label, group }) => {
                    const v = scores[key] ?? 0;
                    const orig = assessment.sub_scores?.[key] ?? 0;
                    const changed = v !== orig;
                    const fill = ((Math.min(5, Math.max(1, v)) - 1) / 4) * 100;
                    return (
                      <div
                        className={`insights-score insights-score--${group}`}
                        key={key}
                      >
                        <div className="insights-score__top">
                          <span className="insights-score__label">{label}</span>
                          <span className="insights-score__val">
                            {v.toFixed(1)}
                            <span className="insights-score__val-max">/5</span>
                          </span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={5}
                          step={0.5}
                          value={v}
                          onChange={(e) =>
                            setScores((s) => ({
                              ...s,
                              [key]: parseFloat(e.target.value),
                            }))
                          }
                          className="insights-score__slider"
                          style={{ ["--fill" as any]: `${fill}%` }}
                          aria-label={`${label} score`}
                        />
                        {changed && (
                          <div className="flex items-center gap-2 mt-1 mb-0.5">
                            <span className="text-[10px] text-muted-foreground w-16 text-right shrink-0">Joseph's</span>
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-muted-foreground/50 rounded-full transition-all duration-300"
                                style={{ width: `${((Math.min(5, Math.max(1, orig)) - 1) / 4) * 100}%` }}
                              />
                            </div>
                            <span className="text-[10px] tabular-nums text-muted-foreground w-6">{orig.toFixed(1)}</span>
                          </div>
                        )}
                        <p className="insights-score__rationale">
                          {RATIONALE[key][bandOf(v)]}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Full report */}
              <section className="insights-sheet__section">
                <div className="insights-sheet__section-title">
                  <span className="insights-sheet__section-num">02</span>
                  Full report
                </div>
                {assessment.report_markdown ? (
                  <div className="insights-report">{rendered}</div>
                ) : (
                  <div className="insights-report insights-report--empty">
                    No structured report yet for this assessment.
                  </div>
                )}
              </section>
            </div>

            <div className="insights-sheet__actions">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExport("pdf")}
                disabled={!assessment.report_markdown}
              >
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExport("docx")}
                disabled={!assessment.report_markdown}
              >
                <FileType className="w-3.5 h-3.5 mr-1.5" />
                DOCX
              </Button>
            </div>
          </>
        )}
      </aside>
    </>
  );
};
