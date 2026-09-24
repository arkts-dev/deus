import { randomUUID } from 'node:crypto';
import { digest } from './process.js';
export function validateFindings(findings, receipts) {
    for (const finding of findings) {
        if (!finding.statement?.trim() || finding.statement.length > 8000)
            throw new Error('Invalid finding');
        for (const id of finding.sources)
            if (!receipts.some((r) => r.id === id))
                throw new Error('Citation was not inspected');
        if (finding.provenance.endsWith('_verified')) {
            const selected = receipts.filter((r) => finding.sources.includes(r.id));
            const kind = finding.provenance === 'local_verified' ? 'local' : 'external';
            if (!selected.length ||
                selected.some((r) => r.kind !== kind) ||
                !finding.quote?.trim() ||
                !selected.some((r) => r.text.includes(finding.quote)))
                throw new Error('Verified citation needs an exact inspected excerpt');
        }
    }
}
export function newReceipt(input) {
    return {
        ...input,
        id: 'source-' + randomUUID(),
        inspectedAt: new Date().toISOString(),
        text: input.text.slice(0, 512000),
    };
}
export function briefDigest(question, materials = []) {
    return digest(JSON.stringify({ question, materials }));
}
