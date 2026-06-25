import { useState } from "react";
import type { CoverageArea, CoveragePayload } from "@/services/consultingAgentApi";

interface CoverageIndicatorProps {
  coverage: CoveragePayload | null;
  sheetNum?: string;
  headless?: boolean;
}

const AREAS: { key: CoverageArea; label: string }[] = [
  { key: "qualification", label: "Qualify" },
  { key: "value", label: "Value" },
  { key: "viability", label: "Viability" },
  { key: "drivers", label: "Drivers" },
  { key: "instinct", label: "Implementation" },
];

/**
 * Sub-sections per discovery area, mirrored from the DISCOVERY INTELLIGENCE
 * framework in Joseph's system prompt. `key` matches the slugs the agent emits
 * in coverage `findings`; `hint` is the framework descriptor shown until a real
 * finding has been gathered.
 */
const SUBSECTIONS: Record<
  CoverageArea,
  { key: string; label: string; hint: string }[]
> = {
  qualification: [
    { key: "solution_fit", label: "Solution fit", hint: "Needs to learn or recognize something new — not over-engineered" },
    { key: "sponsor", label: "Sponsor & ownership", hint: "Real decision owner; who would defend it in a steering committee" },
    { key: "duplication", label: "Duplication", hint: "Not already in flight under another initiative" },
    { key: "scope", label: "Scope", hint: "A single use case, not a portfolio" },
  ],
  value: [
    { key: "quantitative", label: "Quantitative", hint: "Named numerator & denominator, baseline, delta, basis, confidence" },
    { key: "qualitative", label: "Qualitative", hint: "DX, CX, regulatory posture, brand, learning, optionality" },
  ],
  viability: [
    { key: "data", label: "Data and platform", hint: "Exists? volume, quality, labelled, access, privacy/rights; stack support, MLOps maturity" },
    { key: "resources", label: "Resources & skills", hint: "Who builds, internal vs vendor, headroom" },
    { key: "money", label: "Effort and Cost", hint: "Order of magnitude, funded vs ask, TCO incl. run cost and time to pilot" },
  ],
  drivers: [
    { key: "monetary", label: "Monetary", hint: "Upside captured / downside avoided" },
    { key: "regulatory", label: "Regulatory", hint: "Compliance pressure, deadline-driven" },
    { key: "strategic", label: "Strategic alignment", hint: "Fit with stated org priorities" },
    { key: "ease", label: "Prioritization", hint: "Quick win vs transformational" },
    { key: "cost_of_delay", label: "Cost of delay", hint: "What waiting a quarter costs" },
  ],
  instinct: [
    { key: "adoption", label: "Adoption risk", hint: "Will users actually use it; the change story" },
    { key: "build_buy", label: "Build vs buy", hint: "Credible vendor today; cost of waiting two quarters" },
    { key: "constraints", label: "Other constraints", hint: "Union, contractual, IP, licensing" },
  ],
};

const countFound = (
  area: CoverageArea,
  findings: Record<string, string> | undefined,
): number =>
  SUBSECTIONS[area].filter((s) => findings?.[s.key]?.trim()).length;

export const CoverageIndicator = ({
  coverage,
  sheetNum = "01",
  headless = false,
}: CoverageIndicatorProps) => {
  const [openArea, setOpenArea] = useState<CoverageArea | null>(null);
  const touched = coverage ? AREAS.filter((a) => coverage[a.key]?.touched).length : 0;

  const activeArea =
    openArea && AREAS.some((a) => a.key === openArea) ? openArea : null;
  const detail = activeArea ? coverage?.[activeArea] : null;
  const detailMeta = activeArea ? AREAS.find((a) => a.key === activeArea)! : null;
  const detailSubs = activeArea ? SUBSECTIONS[activeArea] : [];
  const detailFindings = detail?.findings ?? {};
  const gathered = activeArea ? countFound(activeArea, detailFindings) : 0;

  const totalSubs = AREAS.reduce((sum, a) => sum + SUBSECTIONS[a.key].length, 0);
  const totalGathered = coverage
    ? AREAS.reduce((sum, a) => sum + countFound(a.key, coverage[a.key]?.findings), 0)
    : 0;
  const progressPct = totalSubs > 0 ? (totalGathered / totalSubs) * 100 : 0;

  const Body = (
    <>
      {/* Total progress bar */}
      <div className="px-4 pt-2 pb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Overall progress</span>
          <span className="text-[11px] font-bold tabular-nums text-foreground">{totalGathered}/{totalSubs}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="joseph-coverage">
        {AREAS.map((a, i) => {
          const item = coverage?.[a.key];
          const isTouched = !!item?.touched;
          const isOpen = activeArea === a.key;
          const found = countFound(a.key, item?.findings);
          return (
            <button
              key={a.key}
              type="button"
              className={`joseph-cov ${isTouched ? "joseph-cov--touched" : ""} ${
                isOpen ? "joseph-cov--open" : ""
              }`}
              onClick={() => setOpenArea((cur) => (cur === a.key ? null : a.key))}
              aria-expanded={isOpen}
              aria-label={`${a.label} — ${found}/${SUBSECTIONS[a.key].length} sub-sections gathered`}
              title={item?.note || (isTouched ? "Touched" : "Not yet explored")}
            >
              <span className="joseph-cov__dot" />
              <div className="joseph-cov__index">{String(i + 1).padStart(2, "0")}</div>
              <div className="joseph-cov__label">{a.label}</div>
              <div className="joseph-cov__count">
                {found}/{SUBSECTIONS[a.key].length}
              </div>
            </button>
          );
        })}
      </div>

      {activeArea && detailMeta && (
        <div
          className="joseph-cov-detail"
          role="region"
          aria-label={`${detailMeta.label} sub-sections`}
        >
          <div className="joseph-cov-detail__head">
            <span className="joseph-cov-detail__title">{detailMeta.label}</span>
            <span className="joseph-cov-detail__count">
              {gathered}/{detailSubs.length} gathered
            </span>
          </div>
          {detail?.note && <p className="joseph-cov-detail__note">{detail.note}</p>}
          <ul className="joseph-cov-detail__list">
            {detailSubs.map((s) => {
              const finding = detailFindings[s.key]?.trim();
              return (
                <li
                  key={s.key}
                  className={`joseph-cov-sub ${finding ? "joseph-cov-sub--found" : ""}`}
                >
                  <div className="joseph-cov-sub__head">
                    <span className="joseph-cov-sub__dot" aria-hidden />
                    <span className="joseph-cov-sub__label">{s.label}</span>
                  </div>
                  {finding ? (
                    <p className="joseph-cov-sub__finding">{finding}</p>
                  ) : (
                    <p className="joseph-cov-sub__finding joseph-cov-sub__finding--empty">
                      {s.hint} · not yet explored
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );

  if (headless) return Body;

  return (
    <section className="joseph-sheet">
      <span className="joseph-sheet__num">{sheetNum}</span>
      <div className="joseph-sheet__title">
        <span className="joseph-sheet__title-text">Discovery coverage</span>
        <span className="ml-auto text-[9px] font-mono tabular-nums text-muted-foreground tracking-[0.18em] uppercase">
          {touched}/{AREAS.length}
        </span>
      </div>
      {Body}
    </section>
  );
};
