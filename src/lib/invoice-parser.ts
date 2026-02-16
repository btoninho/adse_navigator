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
  // Future providers go here:
  // { id: "luz", label: "Luz Saúde", detect: ..., parse: parseLuz },
  // { id: "lusiadas", label: "Lusíadas", detect: ..., parse: parseLusiadas },
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

// pdfjs-dist renders CUF invoices with a different column order than pdfplumber:
//   [description] qty clientValue date totalValue code efrValue
//
// When descriptions span multiple lines, the data line has no description prefix:
//   qty clientValue date totalValue code efrValue

// Full line: description qty clientValue date totalValue code efrValue
const FULL_LINE_RE =
  /^(.+?)\s+(\d+\.\d+)\s+([\d.,]+)\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.,]+)\s+(\d+)\s+([\d.,]+)\s*$/;

// Full line with CHNM: description qty clientValue date totalValue code chnm efrValue
const FULL_LINE_CHNM_RE =
  /^(.+?)\s+(\d+\.\d+)\s+([\d.,]+)\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.,]+)\s+(\d+)\s+(\d{5,})\s+([\d.,]+)\s*$/;

// Data-only line (description on preceding lines): qty clientValue date totalValue code efrValue
const DATA_RE =
  /^(\d+\.\d+)\s+([\d.,]+)\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.,]+)\s+(\d+)\s+([\d.,]+)\s*$/;

// Data-only with CHNM: qty clientValue date totalValue code chnm efrValue
const DATA_CHNM_RE =
  /^(\d+\.\d+)\s+([\d.,]+)\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.,]+)\s+(\d+)\s+(\d{5,})\s+([\d.,]+)\s*$/;

// Lines to skip (headers, footers, section separators)
const SKIP_RE =
  /^(Sub-Total|Total|Contagem|Hospital|Isento|Emitido|L06C|Morada|Tel\.|Sede|Capital|Fatura|Pág\.|Original|Data de|Nr\.|ATCUD|Cliente|Acto|Unitário|Qtd\.|EFR|Pagamento|O talão|CONSERVE|Convenção|Em caso|vigor|\*)/;

// Invoice section headers (all-caps category names) — skip from descriptions
const SECTION_RE =
  /^(URGÊNCIA|SERVIÇOS|PATOLOGIA|ANÁLISES|ANATOMIA|CIRURGIA|CONSULTAS|RX |TAC|ECOGRAFIA|MEDICINA|ESTOMATOLOGIA|FARMACOS|IMUNOHEMOTERAPIA|ENDOSCOPIA|CARDIOLOGIA|DERMATOLOGIA|FISIATRIA|GASTROENTEROLOGIA|GINECOLOGIA|NEUROLOGIA|OFTALMOLOGIA|ORTOPEDIA|OTORRINOLARINGOLOGIA|PEDIATRIA|PNEUMOLOGIA|PSICOLOGIA|PSIQUIATRIA|RADIOLOGIA|UROLOGIA|SERVIÇOS ESPECIAIS|RX CONVENCIONAL)/;

export function parseCUF(text: string): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  const lines = text.split("\n");
  const descBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Try full line with CHNM first (drugs)
    let m = line.match(FULL_LINE_CHNM_RE);
    if (m) {
      items.push({
        date: m[4],
        code: m[6],
        description: m[1].trim(),
        qty: parseFloat(m[2]),
        unitValue: parsePtDecimal(m[5]) / parseFloat(m[2]),
        efrValue: parsePtDecimal(m[8]),
        clientValue: parsePtDecimal(m[3]),
      });
      descBuffer.length = 0;
      continue;
    }

    // Try full line (description + data on same line)
    m = line.match(FULL_LINE_RE);
    if (m) {
      items.push({
        date: m[4],
        code: m[6],
        description: m[1].trim(),
        qty: parseFloat(m[2]),
        unitValue: parsePtDecimal(m[5]) / parseFloat(m[2]),
        efrValue: parsePtDecimal(m[7]),
        clientValue: parsePtDecimal(m[3]),
      });
      descBuffer.length = 0;
      continue;
    }

    // Try data-only with CHNM (description was on previous lines)
    m = line.match(DATA_CHNM_RE);
    if (m) {
      items.push({
        date: m[3],
        code: m[5],
        description: descBuffer.join(" ").trim(),
        qty: parseFloat(m[1]),
        unitValue: parsePtDecimal(m[4]) / parseFloat(m[1]),
        efrValue: parsePtDecimal(m[7]),
        clientValue: parsePtDecimal(m[2]),
      });
      descBuffer.length = 0;
      continue;
    }

    // Try data-only line
    m = line.match(DATA_RE);
    if (m) {
      items.push({
        date: m[3],
        code: m[5],
        description: descBuffer.join(" ").trim(),
        qty: parseFloat(m[1]),
        unitValue: parsePtDecimal(m[4]) / parseFloat(m[1]),
        efrValue: parsePtDecimal(m[6]),
        clientValue: parsePtDecimal(m[2]),
      });
      descBuffer.length = 0;
      continue;
    }

    // Skip known non-description lines
    if (SKIP_RE.test(line)) {
      descBuffer.length = 0;
      continue;
    }

    // Skip section headers (category names) — don't include in descriptions
    if (SECTION_RE.test(line)) {
      descBuffer.length = 0;
      continue;
    }

    // Buffer as potential description line for the next data line
    descBuffer.push(line);
  }

  return items;
}

// ---------------------------------------------------------------------------
// PDF text extraction (pdfjs-dist)
// ---------------------------------------------------------------------------

/**
 * Reconstruct lines from pdfjs-dist text items by grouping on Y position.
 * This is extracted so the CI test can use the same logic.
 */
export function reconstructLines(
  items: Array<{ str: string; transform: number[] }>,
): string[] {
  let currentY: number | null = null;
  let currentLine = "";
  const lineTexts: string[] = [];

  for (const item of items) {
    const y = Math.round(item.transform[5]);
    if (currentY !== null && Math.abs(y - currentY) > 2) {
      lineTexts.push(currentLine);
      currentLine = item.str;
    } else {
      currentLine += (currentLine ? " " : "") + item.str;
    }
    currentY = y;
  }
  if (currentLine) lineTexts.push(currentLine);

  return lineTexts;
}
