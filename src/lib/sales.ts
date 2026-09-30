export const SOURCES = [
  { value: "email", label: "Email outreach" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "ads", label: "Ads / inbound" },
  { value: "referral", label: "Referral" },
  { value: "website", label: "Website request" },
  { value: "csv", label: "CSV import" },
] as const;

export type Source = (typeof SOURCES)[number]["value"];

export const STAGES = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "engaged", label: "Engaged" },
  { value: "meeting", label: "Meeting booked" },
  { value: "proposal", label: "Closing" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
] as const;

export type Stage = (typeof STAGES)[number]["value"];

/** The 5 active steps every lead walks through, in order. Won/Lost are outcomes. */
export const PIPELINE_STEPS: Stage[] = ["new", "contacted", "engaged", "meeting", "proposal"];

export const STAGE_META: Record<Stage, { label: string; short: string; meaning: string }> = {
  new: {
    label: "1. New",
    short: "New",
    meaning: "In the list, nobody reached out yet.",
  },
  contacted: {
    label: "2. Contacted",
    short: "Contacted",
    meaning: "First outreach is out, no reply yet.",
  },
  engaged: {
    label: "3. Engaged",
    short: "Engaged",
    meaning: "They replied or showed interest.",
  },
  meeting: {
    label: "4. Meeting booked",
    short: "Meeting",
    meaning: "A call or visit is agreed.",
  },
  proposal: {
    label: "5. Closing",
    short: "Closing",
    meaning: "Everything is on the table, waiting for the final yes.",
  },
  won: {
    label: "Won",
    short: "Won",
    meaning: "Deal closed, they are a client.",
  },
  lost: {
    label: "Lost",
    short: "Lost",
    meaning: "No deal for now.",
  },
};

export function stageStep(stage: string) {
  const index = PIPELINE_STEPS.indexOf(stage as Stage);
  return index === -1 ? null : index + 1;
}

export const CHANNELS = [
  { value: "email", label: "Email" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
  { value: "ads", label: "Ads / inbound" },
  { value: "note", label: "Note" },
] as const;

export type Channel = (typeof CHANNELS)[number]["value"];

export const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "team_leader", label: "Team leader" },
  { value: "rep", label: "Sales rep" },
] as const;

export type Role = (typeof ROLES)[number]["value"];

export const labelFor = (
  list: readonly { value: string; label: string }[],
  value: string | null | undefined,
) => list.find((item) => item.value === value)?.label ?? value ?? "—";

export const OPEN_STAGES: Stage[] = ["new", "contacted", "engaged", "meeting", "proposal"];

export function priorityLabel(priority: number) {
  if (priority >= 5) return "Key account";
  if (priority === 4) return "High";
  if (priority === 3) return "Medium";
  if (priority === 2) return "Low";
  return "Cold";
}

export function formatMoney(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("nl-BE", { day: "2-digit", month: "short", year: "numeric" });
}

/** Minimal RFC-4180-ish CSV parser (handles quotes, commas and semicolons). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const firstLine = clean.split("\n")[0] ?? "";
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    if (quoted) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (char === "\n") {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell !== ""));
}

export const IMPORT_FIELDS = [
  { key: "company", label: "Company", required: true },
  { key: "contact_name", label: "Contact name" },
  { key: "job_title", label: "Job title" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "linkedin_url", label: "LinkedIn URL" },
  { key: "website", label: "Website" },
  { key: "city", label: "City" },
  { key: "country", label: "Country" },
  { key: "campaign", label: "Campaign" },
  { key: "notes", label: "Notes" },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];

const HEADER_HINTS: Record<ImportFieldKey, string[]> = {
  company: ["company", "account", "organisation", "organization", "bedrijf", "firma"],
  contact_name: ["contact", "name", "full name", "naam", "contactpersoon"],
  job_title: ["title", "job", "role", "functie"],
  email: ["email", "e-mail", "mail"],
  phone: ["phone", "tel", "mobile", "telefoon"],
  linkedin_url: ["linkedin", "profile url", "li url"],
  website: ["website", "url", "domain", "site"],
  city: ["city", "stad", "plaats", "ville"],
  country: ["country", "land", "pays"],
  campaign: ["campaign", "campagne", "list", "ad set", "adset"],
  notes: ["notes", "note", "comment", "opmerking"],
};

export function guessMapping(headers: string[]): Record<ImportFieldKey, string> {
  const mapping = {} as Record<ImportFieldKey, string>;
  for (const field of IMPORT_FIELDS) {
    const hints = HEADER_HINTS[field.key];
    const match = headers.find((header) => {
      const h = header.toLowerCase().trim();
      return hints.some((hint) => h === hint || h.includes(hint));
    });
    mapping[field.key] = match ?? "";
  }
  return mapping;
}

/* ---------------- CSV export ---------------- */

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (value: string | number | null | undefined) => {
    const text = value == null ? "" : String(value);
    return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}

export function downloadCsv(fileName: string, csv: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/* ---------------- duplicate matching ---------------- */

export const normalizeText = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase();

export const normalizeLinkedIn = (value: string | null | undefined) =>
  normalizeText(value)
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "")
    .replace(/\?.*$/, "");

export type DuplicateCandidate = {
  id: string;
  company: string | null;
  contact_name: string | null;
  email: string | null;
  linkedin_url: string | null;
};

/** Match on email, then LinkedIn URL, then company + contact name. */
export function findDuplicate<T extends DuplicateCandidate>(
  row: {
    company?: string | null;
    contact_name?: string | null;
    email?: string | null;
    linkedin_url?: string | null;
  },
  existing: T[],
): T | null {
  const email = normalizeText(row.email);
  if (email) {
    const hit = existing.find((item) => normalizeText(item.email) === email);
    if (hit) return hit;
  }
  const linkedin = normalizeLinkedIn(row.linkedin_url);
  if (linkedin) {
    const hit = existing.find((item) => normalizeLinkedIn(item.linkedin_url) === linkedin);
    if (hit) return hit;
  }
  const company = normalizeText(row.company);
  const contact = normalizeText(row.contact_name);
  if (company && contact) {
    const hit = existing.find(
      (item) =>
        normalizeText(item.company) === company && normalizeText(item.contact_name) === contact,
    );
    if (hit) return hit;
  }
  return null;
}

export function todayIso(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}
