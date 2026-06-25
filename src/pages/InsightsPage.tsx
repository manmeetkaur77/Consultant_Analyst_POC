import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Library } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import {
  fetchInsights,
  type InsightAssessment,
} from "@/services/consultingAgentApi";
import { InsightsMatrix } from "@/components/insights/InsightsMatrix";
import { AssessmentRow } from "@/components/insights/AssessmentRow";
import { ReportSideSheet } from "@/components/insights/ReportSideSheet";

// Four visual quadrants on the 2x2 matrix. Accelerator and Transformational
// Value both live in the NW corner of the chart (high impact, lower speed),
// so they're shown under a single tab.
type QuadrantTab =
  | "Transformational"
  | "Accelerators"
  | "Quick Wins"
  | "Incremental Growth";

const TAB_ORDER: QuadrantTab[] = [
  "Transformational",
  "Accelerators",
  "Quick Wins",
  "Incremental Growth",
];

const TAB_DESCRIPTION: Record<QuadrantTab, string> = {
  "Transformational": "High impact · longer to deliver",
  "Accelerators": "High impact · high speed",
  "Quick Wins": "Fast to ship · moderate impact",
  "Incremental Growth": "Lower impact · steady progress",
};

// Which underlying quadrants count toward each tab
const TAB_INCLUDES: Record<QuadrantTab, string[]> = {
  "Transformational": ["Transformational Value", "Accelerator"],
  "Accelerators": ["Quick Win"],
  "Quick Wins": ["Incremental Growth"],
  "Incremental Growth": ["Defer"],
};

const InsightsPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const focusId = params.get("caseId");

  const [assessments, setAssessments] = useState<InsightAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openAssessment, setOpenAssessment] = useState<InsightAssessment | null>(null);
  const [activeTab, setActiveTab] = useState<QuadrantTab>("Transformational");

  // Leadership overrides: quadrant + axes, so both the tab and the matrix dot update.
  type AssessmentOverride = { quadrant: string; impact: number; speed: number };
  const [overrides, setOverrides] = useState<Record<string, AssessmentOverride>>(() => {
    try { return JSON.parse(localStorage.getItem("lq_overrides") ?? "{}"); }
    catch { return {}; }
  });

  const handleQuadrantOverride = useCallback(
    (id: string, override: AssessmentOverride | null) => {
      setOverrides((prev) => {
        const next = { ...prev };
        if (override === null) delete next[id];
        else next[id] = override;
        localStorage.setItem("lq_overrides", JSON.stringify(next));
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchInsights();
        if (cancelled) return;
        setAssessments(data);
        if (focusId) {
          const target = data.find((a) => a.id === focusId);
          if (target) setOpenAssessment(target);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [focusId]);

  // Effective quadrant for an assessment — uses leadership override if set
  const effectiveQuadrant = useCallback(
    (a: InsightAssessment) => overrides[a.id]?.quadrant ?? a.quadrant,
    [overrides],
  );

  // Assessments with axes patched by leadership overrides — used by the matrix
  // so dots move to their new position when sliders are adjusted.
  const assessmentsForMatrix = useMemo(
    () =>
      assessments.map((a) => {
        const ov = overrides[a.id];
        if (!ov) return a;
        return { ...a, axes: { impact: ov.impact, speed: ov.speed } };
      }),
    [assessments, overrides],
  );

  // Per-quadrant counts mapped to visual matrix corners (using effective quadrant
  // so leadership overrides are reflected in the corner badges too).
  const quadrantCounts = useMemo(
    () => ({
      // NW — Transformational Value + Accelerator (high impact, low-medium speed)
      "Transformational Value":
        assessments.filter((a) => effectiveQuadrant(a) === "Transformational Value").length,
      Accelerator:
        assessments.filter((a) => effectiveQuadrant(a) === "Accelerator").length,
      // NE — Quick Win (high impact, high speed)
      "Quick Win":
        assessments.filter((a) => effectiveQuadrant(a) === "Quick Win").length,
      // SE — Incremental Growth
      "Incremental Growth":
        assessments.filter((a) => effectiveQuadrant(a) === "Incremental Growth").length,
      // SW — Defer
      Defer:
        assessments.filter((a) => effectiveQuadrant(a) === "Defer").length,
    }),
    [assessments, effectiveQuadrant],
  );

  // Index cards filtered by tab, respecting leadership overrides
  const filteredForCards = useMemo(() => {
    const includes = TAB_INCLUDES[activeTab];
    return assessments.filter((a) => includes.includes(effectiveQuadrant(a)));
  }, [assessments, activeTab, effectiveQuadrant]);

  // Per-tab count derived from quadrantCounts (effective, post-override)
  const tabCounts = useMemo(
    () => ({
      "Transformational":
        (quadrantCounts["Transformational Value"] ?? 0) + (quadrantCounts.Accelerator ?? 0),
      "Accelerators": quadrantCounts["Quick Win"] ?? 0,
      "Quick Wins": quadrantCounts["Incremental Growth"] ?? 0,
      "Incremental Growth": quadrantCounts.Defer ?? 0,
    }),
    [quadrantCounts],
  );

  return (
    <div className="min-h-screen bg-background">
      <MainLayout currentView="insights">
        <div className="insights-page">
          {/* ── Hero ─────────────────────────────────────── */}
          <section className="insights-hero">
            <div className="insights-hero__brand">
              <Library className="w-4 h-4" />
              <span>Insights</span>
              <span className="insights-hero__brand-divider" />
              <span className="insights-hero__brand-sub">Leadership review</span>
            </div>

            <div className="insights-hero__display">
              <span className="insights-hero__bar" aria-hidden />
              <h1 className="insights-hero__title">
                AI use cases
                <span className="insights-hero__title-2">across the organization.</span>
              </h1>
            </div>

            <div className="insights-hero__rule" aria-hidden>
              <span className="insights-hero__rule-dot" />
              <span className="insights-hero__rule-line" />
              <span className="insights-hero__rule-meta">
                {assessments.length} assessments &nbsp;·&nbsp; 4 quadrants
              </span>
            </div>

            <div className="insights-hero__lede-wrap">
              <span className="insights-hero__lede-mark" aria-hidden />
              <p className="insights-hero__lede">
                <span className="insights-hero__lede-first">Every assessment Joseph has run</span>, plotted
                on a Business&nbsp;Impact × Speed&nbsp;to&nbsp;Value matrix. Click any dot or card to read the
                full feasibility report.
              </p>
            </div>
          </section>

          {/* ── Matrix board (shows the full portfolio, unfiltered) ── */}
          <section className="insights-matrix-section">
            <div className="insights-section-head">
              <h2 className="insights-section-title">Portfolio matrix</h2>
              <span className="insights-section-hint">
                Click a dot to read its full report.
              </span>
            </div>
            <InsightsMatrix
              assessments={assessmentsForMatrix}
              activeId={openAssessment?.id ?? null}
              onPointClick={(a) => setOpenAssessment(a)}
              quadrantCounts={quadrantCounts}
            />
          </section>

          {/* ── Quadrant tabs ────────────────────────────── */}
          <section className="insights-cards-section">
            <div className="insights-section-head">
              <h2 className="insights-section-title">Assessment index</h2>
              <span className="insights-section-hint">
                {filteredForCards.length} case{filteredForCards.length === 1 ? "" : "s"} in {activeTab}
              </span>
            </div>

            <div className="insights-tabs" role="tablist" aria-label="Filter by quadrant">
              {TAB_ORDER.map((tab) => {
                const count = tabCounts[tab];
                const active = activeTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(tab)}
                    className={`insights-tab ${active ? "insights-tab--active" : ""}`}
                  >
                    <span className="insights-tab__main">
                      <span className="insights-tab__label">{tab}</span>
                      <span className="insights-tab__sub">{TAB_DESCRIPTION[tab]}</span>
                    </span>
                    <span className="insights-tab__count">{count}</span>
                  </button>
                );
              })}
            </div>

            {loading && (
              <div className="insights-empty">Loading assessments…</div>
            )}
            {error && (
              <div className="insights-empty insights-empty--error">{error}</div>
            )}
            {!loading && !error && filteredForCards.length === 0 && (
              <div className="insights-empty">
                No assessments in {activeTab} yet.
              </div>
            )}

            <div className="insights-grid">
              {filteredForCards.map((a, idx) => (
                <AssessmentRow
                  key={a.id}
                  assessment={a}
                  index={idx + 1}
                  active={a.id === openAssessment?.id}
                  onOpen={(x) => setOpenAssessment(x)}
                />
              ))}
            </div>
          </section>

          {/* ── Footer CTA ───────────────────────────────── */}
          <div className="insights-cta">
            <div className="insights-cta__copy">
              <strong>Got a new idea to evaluate?</strong>
              <span>Open the Consulting Agent and Joseph will work it into a defensible feasibility report.</span>
            </div>
            <button
              type="button"
              onClick={() => navigate("/consulting-agent")}
              className="insights-cta__btn"
            >
              Open Consulting Agent →
            </button>
          </div>
        </div>
      </MainLayout>

      <ReportSideSheet
        assessment={openAssessment}
        onClose={() => setOpenAssessment(null)}
        onQuadrantOverride={handleQuadrantOverride}
      />
    </div>
  );
};

export default InsightsPage;
