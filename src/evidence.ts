import { randomUUID } from 'node:crypto';
import { digest } from './process.js';
export interface SourceReceipt {
  id: string;
  kind: 'local' | 'external';
  locator: string;
  sha256: string;
  inspectedAt: string;
  revision?: string;
  dirtyDigest?: string;
  root?: string;
  path?: string;
  text: string;
}
export interface Finding {
  statement: string;
  provenance:
    'local_verified' | 'external_verified' | 'inference' | 'parametric_unverified' | 'gap';
  sources: string[];
  quote?: string;
}
export interface ResearchReport {
  id: string;
  question: string;
  briefDigest: string;
  status: 'completed' | 'partial' | 'unavailable' | 'cancelled';
  findings: Finding[];
  mechanism: string;
  consequences: string;
  applicability: string;
  uncertainty: string[];
  decisionDimensions: string[];
  gaps: string[];
  receipts: SourceReceipt[];
  limits: {
    requests: number;
    maxRequests: number;
    turns: number;
    elapsedMs: number;
    usage?: unknown;
  };
  receiptValidation: 'passed';
  semanticReview: 'required';
  createdAt: string;
}
export function validateFindings(findings: Finding[], receipts: SourceReceipt[]) {
  for (const finding of findings) {
    if (!finding.statement?.trim() || finding.statement.length > 8000)
      throw new Error('Invalid finding');
    for (const id of finding.sources)
      if (!receipts.some((r) => r.id === id)) throw new Error('Citation was not inspected');
    if (finding.provenance.endsWith('_verified')) {
      const selected = receipts.filter((r) => finding.sources.includes(r.id));
      const kind = finding.provenance === 'local_verified' ? 'local' : 'external';
      if (
        !selected.length ||
        selected.some((r) => r.kind !== kind) ||
        !finding.quote?.trim() ||
        !selected.some((r) => r.text.includes(finding.quote!))
      )
        throw new Error('Verified citation needs an exact inspected excerpt');
    }
  }
}
export function newReceipt(input: Omit<SourceReceipt, 'id' | 'inspectedAt'>): SourceReceipt {
  return {
    ...input,
    id: 'source-' + randomUUID(),
    inspectedAt: new Date().toISOString(),
    text: input.text.slice(0, 512000),
  };
}
export function briefDigest(question: string, materials: unknown = []) {
  return digest(JSON.stringify({ question, materials }));
}
