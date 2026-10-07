import { createHash, timingSafeEqual } from "node:crypto";

export const EXPORT_LIMIT = 1000;
export const EXPORT_COLUMNS =
  "id,created_at,updated_at,deleted_at,stage,source,campaign,value_estimate,notes";

export type ExportLead = {
  id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  stage: string;
  source: string;
  campaign: string | null;
  value_estimate: number | null;
  notes: string | null;
};

export function validExportToken(header: string | null, expected: string | undefined) {
  if (!expected || !/^[a-f0-9]{64}$/i.test(expected)) return false;
  const supplied = header?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
  if (!supplied) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(supplied), digest(expected));
}

// The legacy site appended UTM lines to free-text notes. Keep these as explicitly
// unverified metadata: they cannot establish first/last touch or a click identity.
export function legacyUtmFromNotes(source: string, notes: string | null) {
  if (source !== "website" || !notes || notes.length > 20_000) return null;
  const starts = notes.match(/^Aanvraag website \(\d{4}-\d\d-\d\dT[^\n]+\): /gm);
  if (starts?.length !== 1) return null;
  const values: Record<string, string> = {};
  for (const line of notes.split(/\r?\n/)) {
    const match = line.match(
      /^(utm_source|utm_medium|utm_campaign|utm_content|utm_term): ([^\r\n]{1,200})$/,
    );
    if (!match?.[1] || !match[2]) continue;
    if (Object.hasOwn(values, match[1])) return null;
    const value = match[2].trim();
    if (!value || [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
      return null;
    values[match[1]] = value;
  }
  return values["utm_source"] && values["utm_medium"] ? values : null;
}

export function exportLead(row: ExportLead) {
  const legacyUtm = legacyUtmFromNotes(row.source, row.notes);
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    stage: row.stage,
    source: row.source,
    campaign: row.campaign,
    valueEstimate: row.value_estimate,
    wonAt: null,
    wonValue: null,
    paidAt: null,
    paidRevenue: null,
    attribution: {
      status: legacyUtm ? "legacy_utm_notes" : "unknown",
      first: null,
      last: null,
      legacyUtm,
    },
  };
}
