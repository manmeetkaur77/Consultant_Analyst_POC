import { API_CONFIG } from "@/config/api";
import { apiPost, apiGet } from "@/services/api";
import { getEffectiveToken } from "@/services/authService";

const BASE = `${API_CONFIG.BASE_URL}/api/consulting`;

export type SubScoreKey =
  | "financial"
  | "productivity"
  | "intent"
  | "complexity"
  | "data_platform"
  | "measurement";

export interface SubScorePayload {
  value: number | null;
  confidence: "low" | "medium" | "high" | null;
  /** What facts/inputs/documents the score was made from. */
  consumed: string | null;
  /** Why those facts map to this 1–5 band rather than the adjacent ones. */
  ranking: string | null;
}

export interface ScoresPayload {
  sub_scores: Record<SubScoreKey, SubScorePayload>;
  axes: { impact: number | null; speed: number | null };
  quadrant: string | null;
}

export type CoverageArea =
  | "qualification"
  | "value"
  | "viability"
  | "drivers"
  | "instinct";

export type CoveragePayload = Record<
  CoverageArea,
  {
    touched: boolean;
    note: string | null;
    /** Sub-section slug → what Joseph gathered about it. */
    findings: Record<string, string>;
  }
>;

export interface CitationPayload {
  url: string;
  title: string | null;
  publisher: string | null;
  tier: "primary" | "secondary" | "directional";
  valid: boolean;
}

export interface Sibling {
  id: string;
  title: string;
  sponsor: string;
  quadrant: string;
  axes: { impact: number; speed: number };
  sub_scores: Record<SubScoreKey, number>;
  status: string;
  one_liner: string;
}

export interface InsightAssessment extends Sibling {
  assessed_at?: string;
  assessed_by?: string;
  report_markdown?: string;
  is_fresh?: boolean;
}

export type KBDocType =
  | "vendor"
  | "internal"
  | "ticket"
  | "lessons"
  | "benchmark"
  | "other";

export interface KBResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  type: KBDocType;
  icon: string;
  relevance: number;
  consumed: boolean;
}

export interface KBResultsPayload {
  results: KBResult[];
  consumed_ids: string[];
}

export type ConsultingSSEEvent =
  | { type: "chunk"; content: string }
  | { type: "metadata"; session_id: string }
  | {
      type: "state";
      kind: "scores";
      payload: ScoresPayload;
    }
  | {
      type: "state";
      kind: "coverage";
      payload: CoveragePayload;
    }
  | {
      type: "state";
      kind: "citations";
      payload: CitationPayload[];
    }
  | {
      type: "state";
      kind: "report";
      payload: string;
    }
  | {
      type: "state";
      kind: "kb_results";
      payload: KBResultsPayload;
    }
  | { type: "done" }
  | { type: "error"; message: string };

export interface UploadResult {
  file_id: string;
  filename: string;
  chars: number;
}

export async function* streamConsultingMessage(
  message: string,
  sessionId: string | null,
  reset: boolean = false,
): AsyncGenerator<ConsultingSSEEvent, void, unknown> {
  const token = await getEffectiveToken();

  const response = await fetch(`${BASE}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      message,
      session_id: sessionId,
      reset,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    yield {
      type: "error",
      message: `HTTP ${response.status}: ${errText.slice(0, 200)}`,
    };
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    yield { type: "error", message: "No response body to read." };
    return;
  }
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;
        try {
          const evt = JSON.parse(raw) as ConsultingSSEEvent;
          yield evt;
        } catch (e) {
          console.warn("[consultingAgentApi] failed to parse SSE line:", raw, e);
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* noop */
    }
  }
}

export async function uploadDocument(
  sessionId: string,
  file: File,
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiPost(
    `${BASE}/upload?session_id=${encodeURIComponent(sessionId)}`,
    formData,
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Upload failed: ${response.status} ${text.slice(0, 200)}`);
  }
  return (await response.json()) as UploadResult;
}

/**
 * Submit a user-edited rationale for one sub-score. Joseph re-evaluates that
 * sub-score (and any others the new information bears on) and returns the
 * updated full scores payload, with axes and quadrant recomputed.
 */
export async function rescoreRationale(args: {
  sessionId: string;
  subScore: SubScoreKey;
  rationale: string;
}): Promise<{ scores: ScoresPayload; message: string }> {
  const response = await apiPost(`${BASE}/rescore`, {
    session_id: args.sessionId,
    sub_score: args.subScore,
    rationale: args.rationale,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Rescore failed: ${response.status} ${text.slice(0, 200)}`);
  }
  return (await response.json()) as { scores: ScoresPayload; message: string };
}

export async function fetchSiblings(): Promise<Sibling[]> {
  const response = await apiGet(`${BASE}/siblings`);
  if (!response.ok) throw new Error(`Siblings fetch failed: ${response.status}`);
  return (await response.json()) as Sibling[];
}

export async function fetchInsights(): Promise<InsightAssessment[]> {
  const response = await apiGet(`${BASE}/insights`);
  if (!response.ok) throw new Error(`Insights fetch failed: ${response.status}`);
  return (await response.json()) as InsightAssessment[];
}

export async function saveToInsights(args: {
  sessionId: string;
  title: string;
  sponsor?: string;
  reportMarkdown: string;
}): Promise<{ saved: boolean; id: string }> {
  const response = await apiPost(`${BASE}/insights/save`, {
    session_id: args.sessionId,
    title: args.title,
    sponsor: args.sponsor,
    report_markdown: args.reportMarkdown,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Save to Insights failed: ${response.status} ${text.slice(0, 200)}`);
  }
  return (await response.json()) as { saved: boolean; id: string };
}

export async function exportReport(
  markdown: string,
  format: "pdf" | "docx",
  filename?: string,
): Promise<{ blob: Blob; downloadFilename: string }> {
  const response = await apiPost(`${BASE}/export`, {
    markdown_report: markdown,
    format,
    filename,
  });
  if (!response.ok) {
    throw new Error(`Export failed: ${response.status}`);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/);
  const downloadFilename = match ? match[1] : `report.${format}`;
  return { blob, downloadFilename };
}

export function buildVeloxHandoffPayload(
  report: string,
  scores: ScoresPayload | null,
  coverage: CoveragePayload | null,
): Record<string, unknown> {
  const sponsorMatch = report.match(/Sponsor:\s*([^\n]+)/i);
  const planningValueMatch = report.match(
    /planning case\s*\$?([\d.,]+\s*[KMB]?)/i,
  );

  const openThreads: string[] = [];
  const risksSection = report.match(/## Risks & Open Threads([\s\S]*?)(?=\n## |\n---|$)/);
  if (risksSection) {
    const items = risksSection[1].match(/^\s*\d+\.\s+(.+)$/gm) || [];
    items.forEach((it) =>
      openThreads.push(it.replace(/^\s*\d+\.\s+/, "").trim()),
    );
  }

  const viabilityFlags: Record<string, string> = {};
  const viabilityTable = report.match(
    /\| Dimension \| Status \| Notes \|([\s\S]*?)(?=\n\n|\n## )/,
  );
  if (viabilityTable) {
    const rows = viabilityTable[1].match(/\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g) || [];
    rows.forEach((row) => {
      const parts = row.split("|").filter((s) => s.trim());
      if (parts.length >= 2) {
        const dim = parts[0].trim().toLowerCase().replace(/\s+/g, "_");
        const status = parts[1].trim();
        if (dim && status && !dim.includes("---")) {
          viabilityFlags[dim] = status;
        }
      }
    });
  }

  return {
    sponsor: sponsorMatch ? sponsorMatch[1].trim() : null,
    planning_value: planningValueMatch ? planningValueMatch[1].trim() : null,
    open_threads: openThreads,
    viability_flags: viabilityFlags,
    scores: scores
      ? {
          sub_scores: scores.sub_scores,
          axes: scores.axes,
          quadrant: scores.quadrant,
        }
      : null,
    coverage,
    generated_at: new Date().toISOString(),
    handoff_target: "Velox",
  };
}
