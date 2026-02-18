// ---------------------------------------------------------------------------
// Invoice parsing logic — shared between browser UI and CI test
// ---------------------------------------------------------------------------

export interface InvoiceItem {
  date: string;
  code: string;
  description: string;
  qty: number;
  unitValue: number;
  efrValue: number;
  clientValue: number;
}

export type ProviderParser = (text: string) => InvoiceItem[];

export interface Provider {
  id: string;
  label: string;
  detect: (text: string) => boolean;
  parse: ProviderParser;
}

// ---------------------------------------------------------------------------
// Provider registry — pluggable structure for future providers
// ---------------------------------------------------------------------------

export const PROVIDERS: Provider[] = [
  {
    id: "cuf",
    label: "CUF",
    detect: (text) => /\bCUF\b/i.test(text),
    parse: parseCUF,
  },
  {
    id: "lusiadas",
    label: "Lusíadas",
    detect: (text) => /Lus[ií]adas/i.test(text),
    parse: parseLusiadas,
  },
  // Future providers go here:
  // { id: "luz", label: "Luz Saúde", detect: ..., parse: parseLuz },
];

/** Detect which provider issued the invoice, or null if unknown. */
export function detectProvider(text: string): Provider | null {
  return PROVIDERS.find((p) => p.detect(text)) ?? null;
}

// ---------------------------------------------------------------------------
// CUF invoice parser
// ---------------------------------------------------------------------------

/** Parse Portuguese decimal: "1.234,56" → 1234.56 */
export function parsePtDecimal(s: string): number {
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}

// After X-position sorting in reconstructLines, pdfjs-dist produces the same
// column order as pdfplumber (natural left-to-right reading order):
//   date code description qty unitValue efrValue clientValue
// With CHNM (drugs): date code description CHNM qty unitValue efrValue clientValue

// Standard line: date code description qty unitValue efrValue clientValue
const CUF_LINE_RE =
  /^(\d{2}\/\d{2}\/\d{4})\s+(\d+)\s+(.+?)\s+(\d+\.\d+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*$/;

// With CHNM: date code description CHNM qty unitValue efrValue clientValue
const CUF_LINE_CHNM_RE =
  /^(\d{2}\/\d{2}\/\d{4})\s+(\d+)\s+(.+?)\s+(\d{5,})\s+(\d+\.\d+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*$/;

// When client copayment is zero it is omitted from the invoice line
const CUF_LINE_NO_COPAY_RE =
  /^(\d{2}\/\d{2}\/\d{4})\s+(\d+)\s+(.+?)\s+(\d+\.\d+)\s+([\d.,]+)\s+([\d.,]+)\s*$/;

// Lines to skip (headers, footers, section separators)
const CUF_SKIP_RE =
  /^(Sub-Total|Total|Contagem|Hospital|Isento|Emitido|L06C|Morada|Tel\.|Sede|Capital|Fatura|Pág\.|Original|Data de|Nr\.|ATCUD|Cliente|Acto|Unitário|Qtd\.|EFR|Pagamento|O talão|CONSERVE|Convenção|Em caso|vigor|\*)/;

export function parseCUF(text: string): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  const lines = text.split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (CUF_SKIP_RE.test(line)) continue;

    // Try line with CHNM first (drugs)
    let m = line.match(CUF_LINE_CHNM_RE);
    if (m) {
      items.push({
        date: m[1],
        code: m[2],
        description: m[3].trim(),
        qty: parseFloat(m[5]),
        unitValue: parsePtDecimal(m[6]),
        efrValue: parsePtDecimal(m[7]),
        clientValue: parsePtDecimal(m[8]),
      });
      continue;
    }

    // Try standard line
    m = line.match(CUF_LINE_RE);
    if (m) {
      items.push({
        date: m[1],
        code: m[2],
        description: m[3].trim(),
        qty: parseFloat(m[4]),
        unitValue: parsePtDecimal(m[5]),
        efrValue: parsePtDecimal(m[6]),
        clientValue: parsePtDecimal(m[7]),
      });
      continue;
    }

    // Try line where client copayment is zero (omitted from invoice)
    m = line.match(CUF_LINE_NO_COPAY_RE);
    if (m) {
      items.push({
        date: m[1],
        code: m[2],
        description: m[3].trim(),
        qty: parseFloat(m[4]),
        unitValue: parsePtDecimal(m[5]),
        efrValue: parsePtDecimal(m[6]),
        clientValue: 0,
      });
      continue;
    }

    // Non-matching lines (section headers, description continuations, etc.) — skip
  }

  return items;
}

// ---------------------------------------------------------------------------
// Lusíadas invoice parser
// ---------------------------------------------------------------------------
//
// After X-position sorting, pdfjs-dist produces the same column order as pdfplumber:
//   date code description qty clientUnitPrice totalUnitPrice copay 0,00 0,00 copay
//
// Key differences from CUF:
// - efrValue is not explicit; computed as totalUnitPrice × qty - copay
// - totalUnitPrice may use spaces as thousands separator ("3 150,00")
// - IVA is always "0,00" for ADSE convention invoices

// Lusíadas line: date code description qty clientUnitPrice totalUnitPrice copay 0,00 0,00 copay
// Standard: totalUnitPrice is a simple number
const LUSIADAS_LINE_RE =
  /^(\d{2}\/\d{2}\/\d{4})\s+(\d+)\s+(.+?)\s+(\d+,\d{2})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+0,00\s+0,00\s+([\d.,]+)\s*$/;

// With space-separated thousands in totalUnitPrice (e.g., "3 150,00")
const LUSIADAS_LINE_SPACE_RE =
  /^(\d{2}\/\d{2}\/\d{4})\s+(\d+)\s+(.+?)\s+(\d+,\d{2})\s+([\d.,]+)\s+(\d{1,3}(?: \d{3})+,\d{2})\s+([\d.,]+)\s+0,00\s+0,00\s+([\d.,]+)\s*$/;

// Lines to skip in Lusíadas invoices
const LUSIADAS_SKIP_RE =
  /^(Fatura|Original|\d{4}-\d{2}-\d{2}$|Data de|Nr\.|P.*g\.|Dados|Visão|Convenção|Val\.|IVA |%|Qtd|ud\d|Isento|CLISA|\(1\)|Hospital Lus|www\.|Impresso|Resumo|Carla|Taxa)/;

export function parseLusiadas(text: string): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  const lines = text.split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (LUSIADAS_SKIP_RE.test(line)) continue;
    if (/Contagem e valor/.test(line) || /Total \(€\)/.test(line)) continue;

    // Try space-thousands pattern first (more specific), then standard
    let m = line.match(LUSIADAS_LINE_SPACE_RE);
    // Space-thousands regex has an extra non-capturing group, so copay indices shift
    if (m) {
      const copay = parsePtDecimal(m[8]);
      const totalPrice = parsePtDecimal(m[6].replace(/ /g, ""));
      const qty = parsePtDecimal(m[4]);

      items.push({
        date: m[1],
        code: m[2],
        description: m[3].trim(),
        qty,
        unitValue: totalPrice,
        efrValue: Math.round((totalPrice * qty - copay) * 100) / 100,
        clientValue: copay,
      });
      continue;
    }

    m = line.match(LUSIADAS_LINE_RE);
    if (m) {
      const copay = parsePtDecimal(m[7]);
      const totalPrice = parsePtDecimal(m[6]);
      const qty = parsePtDecimal(m[4]);

      items.push({
        date: m[1],
        code: m[2],
        description: m[3].trim(),
        qty,
        unitValue: totalPrice,
        efrValue: Math.round((totalPrice * qty - copay) * 100) / 100,
        clientValue: copay,
      });
    }

    // Non-matching lines (section headers, description continuations, etc.) — skip
  }

  return items;
}

// ---------------------------------------------------------------------------
// PDF text extraction (pdfjs-dist)
// ---------------------------------------------------------------------------

/**
 * Reconstruct lines from pdfjs-dist text items by grouping on Y position.
 *
 * PDF content streams don't guarantee visual order — items at the same Y
 * can be interleaved with items at different Y positions. We collect all
 * items first, group by Y (with tolerance), sort groups top-to-bottom
 * (descending Y) and items within each group left-to-right (ascending X).
 */
export function reconstructLines(
  items: Array<{ str: string; transform: number[] }>,
): string[] {
  if (items.length === 0) return [];

  // Bucket items by rounded Y, merging nearby Y values (tolerance ±2)
  const yGroups: Map<number, Array<{ str: string; x: number }>> = new Map();

  for (const item of items) {
    const y = Math.round(item.transform[5]);
    const x = Math.round(item.transform[4]);

    // Find an existing bucket within tolerance
    let bucketY: number | undefined;
    for (const ky of yGroups.keys()) {
      if (Math.abs(y - ky) <= 2) {
        bucketY = ky;
        break;
      }
    }

    if (bucketY !== undefined) {
      yGroups.get(bucketY)!.push({ str: item.str, x });
    } else {
      yGroups.set(y, [{ str: item.str, x }]);
    }
  }

  // Sort groups top-to-bottom (descending Y in PDF coordinates)
  const sortedYs = [...yGroups.keys()].sort((a, b) => b - a);

  const lineTexts: string[] = [];
  for (const y of sortedYs) {
    const group = yGroups.get(y)!;
    // Sort items left-to-right within each line
    group.sort((a, b) => a.x - b.x);
    lineTexts.push(group.map((g) => g.str).join(" "));
  }

  return lineTexts;
}
