import * as XLSX from "xlsx";

import {
    LeadUploadPreviewItem,
    LeadUploadPreviewRequest,
    LeadUploadPreviewResponse,
    LeadUploadRejectedItem,
    PhoneStatus,
} from "../../../../shared/contracts";

type ParsedInputRow = {
  rowIndex: number;
  cells: Record<string, string>;
};

type PhoneExtractionResult = {
  status: PhoneStatus;
  rawPhone: string | null;
  extractedDigits: string | null;
  normalizedPhone10d: string | null;
  normalizedPhoneE164: string | null;
  invalidReason?: string;
};

type HeaderTag = "name" | "phone" | "email" | "company" | "city" | "state" | "source" | "other";

const HEADER_HINTS: Record<Exclude<HeaderTag, "other">, string[]> = {
  name: ["name", "full name", "lead name", "customer name", "client name"],
  phone: ["phone", "phone number", "mobile", "mobile number", "contact", "contact number", "whatsapp"],
  email: ["email", "email id", "mail"],
  company: ["company", "organization", "organisation", "firm", "business"],
  city: ["city", "town"],
  state: ["state", "province"],
  source: ["source", "channel", "campaign source", "lead source"],
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeCell(value: unknown): string {
  return String(value ?? "").replace(/\uFEFF/g, "").trim();
}

function detectDelimiter(lines: string[]): string {
  const candidates = [",", ";", "\t", "|"];
  const sample = lines.slice(0, 8);

  let best = ",";
  let bestScore = -1;

  for (const delimiter of candidates) {
    let total = 0;
    for (const line of sample) {
      let inQuotes = false;
      for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (char === '"') {
          if (inQuotes && line[index + 1] === '"') {
            index += 1;
            continue;
          }
          inQuotes = !inQuotes;
          continue;
        }

        if (!inQuotes && char === delimiter) {
          total += 1;
        }
      }
    }

    if (total > bestScore) {
      bestScore = total;
      best = delimiter;
    }
  }

  return best;
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function dedupeHeaders(rawHeaders: string[]): string[] {
  const used = new Map<string, number>();

  return rawHeaders.map((header, index) => {
    const normalized = normalizeHeader(normalizeCell(header)) || `column_${index + 1}`;
    const count = (used.get(normalized) ?? 0) + 1;
    used.set(normalized, count);
    return count === 1 ? normalized : `${normalized}_${count}`;
  });
}

function parseCsvText(text: string): ParsedInputRow[] {
  const noBom = text.replace(/^\uFEFF/, "");
  const lines = noBom.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return [];
  }

  const delimiter = detectDelimiter(lines);
  const table = lines.map((line) => parseCsvLine(line, delimiter));
  const headers = dedupeHeaders(table[0] ?? []);

  const rows: ParsedInputRow[] = [];
  for (let rowIndex = 1; rowIndex < table.length; rowIndex += 1) {
    const values = table[rowIndex];
    const cells: Record<string, string> = {};

    headers.forEach((header, headerIndex) => {
      cells[header] = normalizeCell(values?.[headerIndex] ?? "");
    });

    rows.push({
      rowIndex,
      cells,
    });
  }

  return rows;
}

function parseWorkbookBuffer(buffer: Buffer): ParsedInputRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer", raw: false, dense: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return [];
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });

  if (matrix.length === 0) {
    return [];
  }

  const headers = dedupeHeaders((matrix[0] ?? []).map((value) => normalizeCell(value)));
  const rows: ParsedInputRow[] = [];

  for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
    const values = matrix[rowIndex] ?? [];
    const cells: Record<string, string> = {};

    headers.forEach((header, headerIndex) => {
      cells[header] = normalizeCell(values[headerIndex]);
    });

    rows.push({ rowIndex, cells });
  }

  return rows;
}

function parseRowsArray(rows: Record<string, unknown>[]): ParsedInputRow[] {
  if (rows.length === 0) {
    return [];
  }

  const rawHeaders = Array.from(
    rows.reduce((set, item) => {
      Object.keys(item).forEach((key) => set.add(String(key)));
      return set;
    }, new Set<string>())
  );
  const headers = dedupeHeaders(rawHeaders);

  return rows.map((item, index) => {
    const cells: Record<string, string> = {};
    headers.forEach((header, headerIndex) => {
      const originalHeader = rawHeaders[headerIndex];
      cells[header] = normalizeCell(item[originalHeader]);
    });
    return {
      rowIndex: index + 1,
      cells,
    };
  });
}

function tagHeader(header: string): HeaderTag {
  const normalized = normalizeHeader(header);

  for (const [tag, hints] of Object.entries(HEADER_HINTS) as [Exclude<HeaderTag, "other">, string[]][]) {
    if (hints.some((hint) => normalized.includes(hint))) {
      return tag;
    }
  }

  return "other";
}

function hasRepeatingDigitPattern(digits: string): boolean {
  return /^([0-9])\1{9}$/.test(digits);
}

function hasSequentialPattern(digits: string): boolean {
  if (digits.length !== 10) {
    return false;
  }

  let asc = true;
  let desc = true;

  for (let index = 1; index < digits.length; index += 1) {
    const prev = Number(digits[index - 1]);
    const curr = Number(digits[index]);
    if (curr !== (prev + 1) % 10) {
      asc = false;
    }
    if (curr !== (prev + 9) % 10) {
      desc = false;
    }
  }

  return asc || desc;
}

function isLikelyFakeDigitSequence(digits: string): boolean {
  return hasRepeatingDigitPattern(digits) || hasSequentialPattern(digits);
}

function stripExtensionTail(text: string): string {
  const match = text.match(/\b(?:ext|extension|x)\b/i);
  if (!match || match.index === undefined) {
    return text;
  }

  const tail = text.slice(match.index + match[0].length);
  const tailDigits = tail.replace(/\D/g, "");
  if (tailDigits.length <= 4) {
    return text.slice(0, match.index);
  }

  return text;
}

function normalizeStrictIndianMobileDigits(digits: string): string | null {
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return digits;
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    const candidate = digits.slice(1, 11);
    return /^[6-9]\d{9}$/.test(candidate) ? candidate : null;
  }

  if (digits.length >= 12 && digits.startsWith("91")) {
    const candidate = digits.slice(2, 12);
    return /^[6-9]\d{9}$/.test(candidate) ? candidate : null;
  }

  if (digits.length >= 14 && digits.startsWith("0091")) {
    const candidate = digits.slice(4, 14);
    return /^[6-9]\d{9}$/.test(candidate) ? candidate : null;
  }

  return null;
}

function scanValidIndianMobileWindows(digits: string): string[] {
  const candidates = new Set<string>();

  for (let index = 0; index <= digits.length - 10; index += 1) {
    const candidate = digits.slice(index, index + 10);
    if (/^[6-9]\d{9}$/.test(candidate) && !isLikelyFakeDigitSequence(candidate)) {
      candidates.add(candidate);
    }
  }

  return Array.from(candidates);
}

function normalizePhoneText(raw: string): {
  candidates: string[];
  extractedDigits: string | null;
  rawPhone: string | null;
  ambiguousReason?: string;
} {
  const text = stripExtensionTail(raw).replace(/\s+/g, " ").trim();

  if (!text) {
    return {
      candidates: [],
      extractedDigits: null,
      rawPhone: null,
      ambiguousReason: "phone_not_found",
    };
  }

  const digitGroups = text.match(/\d+/g) ?? [];
  if (digitGroups.length === 0) {
    return {
      candidates: [],
      extractedDigits: null,
      rawPhone: text,
      ambiguousReason: "phone_not_found",
    };
  }

  const longGroups = digitGroups.filter((group) => group.length >= 10).length;
  const groupedDigits = digitGroups.join("");

  const collectCandidates = (digits: string): string[] => {
    const exact = normalizeStrictIndianMobileDigits(digits);
    if (exact) {
      return [exact];
    }

    return scanValidIndianMobileWindows(digits);
  };

  if (longGroups <= 1) {
    const combinedCandidates = collectCandidates(groupedDigits);
    if (combinedCandidates.length > 0) {
      return {
        candidates: combinedCandidates,
        extractedDigits: groupedDigits,
        rawPhone: text,
        ambiguousReason: combinedCandidates.length > 1 ? "multiple_valid_phone_candidates_in_field" : undefined,
      };
    }
  }

  const perGroupCandidates = new Set<string>();
  for (const group of digitGroups) {
    const candidates = collectCandidates(group);
    if (candidates.length > 1) {
      return {
        candidates,
        extractedDigits: group,
        rawPhone: text,
        ambiguousReason: "multiple_valid_phone_candidates_in_field",
      };
    }

    if (candidates.length === 1) {
      perGroupCandidates.add(candidates[0]);
    }
  }

  return {
    candidates: Array.from(perGroupCandidates),
    extractedDigits: groupedDigits,
    rawPhone: text,
    ambiguousReason:
      perGroupCandidates.size > 1
        ? "multiple_valid_phone_candidates_in_row"
        : perGroupCandidates.size === 0
          ? "no_valid_indian_mobile_detected"
          : undefined,
  };
}

function pickCellByTag(cells: Record<string, string>, tag: HeaderTag): { value: string | null; sourceColumns: string[] } {
  const candidates = Object.entries(cells)
    .filter(([header, value]) => value && tagHeader(header) === tag)
    .sort(([a], [b]) => a.localeCompare(b));

  if (candidates.length === 0) {
    return { value: null, sourceColumns: [] };
  }

  return {
    value: candidates.map((item) => item[1]).join(" | "),
    sourceColumns: candidates.map((item) => item[0]),
  };
}

function extractPhoneFromRow(cells: Record<string, string>): PhoneExtractionResult {
  const phoneFields = Object.entries(cells).filter(([header, value]) => value && tagHeader(header) === "phone");
  const fullRowText = Object.values(cells).filter(Boolean).join(" | ");

  const sources = phoneFields.length > 0 ? phoneFields.map((item) => item[1]) : [fullRowText];
  const extractedPerSource = sources.map((source) => normalizePhoneText(source));
  const validCandidates = extractedPerSource.flatMap((result) => result.candidates.map((candidate) => ({
    candidate,
    extractedDigits: result.extractedDigits,
    rawPhone: result.rawPhone,
  })));

  if (validCandidates.length === 0) {
    const firstFailure = extractedPerSource.find((result) => result.ambiguousReason);
    return {
      status: "invalid",
      rawPhone: firstFailure?.rawPhone ?? sources[0] ?? null,
      extractedDigits: firstFailure?.extractedDigits ?? null,
      normalizedPhone10d: null,
      normalizedPhoneE164: null,
      invalidReason: firstFailure?.ambiguousReason ?? "phone_not_found",
    };
  }

  const uniqueCandidates = Array.from(new Set(validCandidates.map((item) => item.candidate)));
  if (uniqueCandidates.length > 1) {
    const primarySource = phoneFields.length > 0 ? "multiple_valid_phone_candidates_in_phone_columns" : "multiple_valid_phone_candidates_in_row";
    return {
      status: "ambiguous",
      rawPhone: validCandidates[0].rawPhone ?? sources[0] ?? null,
      extractedDigits: validCandidates[0].extractedDigits ?? null,
      normalizedPhone10d: null,
      normalizedPhoneE164: null,
      invalidReason: primarySource,
    };
  }

  const normalizedPhone10d = uniqueCandidates[0];
  return {
    status: "valid",
    rawPhone: validCandidates[0].rawPhone ?? sources[0] ?? null,
    extractedDigits: validCandidates[0].extractedDigits ?? normalizedPhone10d,
    normalizedPhone10d,
    normalizedPhoneE164: `+91${normalizedPhone10d}`,
  };
}

function normalizeEmail(raw: string | null): string | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  return isValid ? trimmed : null;
}

function computeRowScore(args: {
  phoneStatus: PhoneStatus;
  name: string | null;
  email: string | null;
  company: string | null;
  city: string | null;
  source: string | null;
}): number {
  let score = 0;

  if (args.phoneStatus === "valid") {
    score += 40;
  }
  if (args.phoneStatus === "ambiguous") {
    score += 8;
  }
  if (args.name) {
    score += 20;
  }
  if (args.email) {
    score += 20;
  }
  if (args.company) {
    score += 8;
  }
  if (args.city) {
    score += 4;
  }
  if (args.source) {
    score += 4;
  }

  return score;
}

function mapParsedRowsToPreview(rows: ParsedInputRow[]): {
  preview: LeadUploadPreviewItem[];
  rejected: LeadUploadRejectedItem[];
} {
  const preview: LeadUploadPreviewItem[] = [];
  const rejected: LeadUploadRejectedItem[] = [];

  for (const row of rows) {
    const name = pickCellByTag(row.cells, "name").value;
    const email = normalizeEmail(pickCellByTag(row.cells, "email").value);
    const company = pickCellByTag(row.cells, "company").value;
    const city = pickCellByTag(row.cells, "city").value;
    const state = pickCellByTag(row.cells, "state").value;
    const source = pickCellByTag(row.cells, "source").value;
    const phone = extractPhoneFromRow(row.cells);
    const score = computeRowScore({
      phoneStatus: phone.status,
      name,
      email,
      company,
      city,
      source,
    });

    const sourceColumns = Object.entries(row.cells)
      .filter(([, value]) => !!value)
      .map(([header]) => header);

    const item: LeadUploadPreviewItem = {
      rowIndex: row.rowIndex,
      name,
      email,
      company,
      rawPhone: phone.rawPhone,
      extractedDigits: phone.extractedDigits,
      normalizedPhone10d: phone.normalizedPhone10d,
      normalizedPhoneE164: phone.normalizedPhoneE164,
      phoneStatus: phone.status,
      invalidReason: phone.invalidReason,
      score,
      sourceColumns,
      cleanedRow: {
        ...row.cells,
        city,
        state,
        source,
      },
    };

    preview.push(item);

    if (phone.status !== "valid") {
      rejected.push({
        rowIndex: row.rowIndex,
        rawPhone: phone.rawPhone,
        reason: phone.invalidReason ?? "invalid_phone",
      });
    }
  }

  return { preview, rejected };
}

function dedupePreviewRows(items: LeadUploadPreviewItem[]): {
  deduped: LeadUploadPreviewItem[];
  duplicateRows: number;
  duplicateRejected: LeadUploadRejectedItem[];
} {
  const bestByPhone = new Map<string, LeadUploadPreviewItem>();
  const bestByEmail = new Map<string, LeadUploadPreviewItem>();
  const duplicateRejected: LeadUploadRejectedItem[] = [];
  let duplicateRows = 0;

  const sorted = [...items].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.rowIndex - b.rowIndex;
  });

  const kept = new Set<number>();

  for (const item of sorted) {
    let duplicateOf: LeadUploadPreviewItem | null = null;

    if (item.normalizedPhoneE164) {
      const existing = bestByPhone.get(item.normalizedPhoneE164);
      if (existing) {
        duplicateOf = existing;
      }
    }

    if (!duplicateOf && item.email) {
      const existingByEmail = bestByEmail.get(item.email);
      if (existingByEmail) {
        duplicateOf = existingByEmail;
      }
    }

    if (duplicateOf) {
      duplicateRows += 1;
      duplicateRejected.push({
        rowIndex: item.rowIndex,
        rawPhone: item.rawPhone,
        reason: `duplicate_of_row_${duplicateOf.rowIndex}`,
      });
      continue;
    }

    kept.add(item.rowIndex);
    if (item.normalizedPhoneE164) {
      bestByPhone.set(item.normalizedPhoneE164, item);
    }
    if (item.email) {
      bestByEmail.set(item.email, item);
    }
  }

  const deduped = items.filter((item) => kept.has(item.rowIndex));
  return {
    deduped,
    duplicateRows,
    duplicateRejected,
  };
}

export function parseInputRows(payload: LeadUploadPreviewRequest): ParsedInputRow[] {
  if (Array.isArray(payload.rows) && payload.rows.length > 0) {
    return parseRowsArray(payload.rows);
  }

  if (payload.csvText && payload.csvText.trim()) {
    return parseCsvText(payload.csvText);
  }

  if (payload.fileBase64 && payload.fileBase64.trim()) {
    const buffer = Buffer.from(payload.fileBase64, "base64");
    const lowerName = String(payload.fileName ?? "").toLowerCase();
    const isCsv = lowerName.endsWith(".csv") || String(payload.mimeType ?? "").includes("csv");

    if (isCsv) {
      return parseCsvText(buffer.toString("utf8"));
    }

    return parseWorkbookBuffer(buffer);
  }

  return [];
}

export function buildLeadUploadPreview(payload: LeadUploadPreviewRequest): LeadUploadPreviewResponse {
  const parsedRows = parseInputRows(payload);
  const totalRows = parsedRows.length;

  const mapped = mapParsedRowsToPreview(parsedRows);
  const validCandidates = mapped.preview.filter((item) => item.phoneStatus === "valid");
  const deduped = dedupePreviewRows(validCandidates);

  const rejected = [...mapped.rejected, ...deduped.duplicateRejected]
    .sort((a, b) => a.rowIndex - b.rowIndex);

  return {
    totalRows,
    validRows: deduped.deduped.length,
    invalidRows: rejected.length,
    duplicateRows: deduped.duplicateRows,
    preview: deduped.deduped.sort((a, b) => a.rowIndex - b.rowIndex),
    rejected,
  };
}

export function normalizeManualLeadRow(payload: Record<string, unknown>): LeadUploadPreviewResponse {
  return buildLeadUploadPreview({
    rows: [payload],
  });
}
