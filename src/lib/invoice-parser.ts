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
// Lusíadas invoice parser
// ---------------------------------------------------------------------------
//
// pdfjs-dist renders Lusíadas invoices with columns in this order:
//   copay 0,00 0,00 copay totalUnitPrice clientUnitPrice qty [description] code date
//
// Key differences from CUF:
// - efrValue is not explicit; computed as totalUnitPrice × qty - copay
// - totalUnitPrice may use spaces as thousands separator ("3 150,00")
// - clientUnitPrice has 3+ decimal places ("0,26000") vs copay's 2 ("0,26")
// - IVA is always "0,00" for ADSE convention invoices

// Numeric prefix: copay 0,00 0,00 copay totalUnitPrice(2 decimals) clientUnitPrice(3+ decimals) qty
// The totalUnitPrice may have space-separated thousands (e.g., "3 150,00")
const LUSIADAS_PREFIX_RE =
  /^([\d.,]+)\s+0,00\s+0,00\s+[\d.,]+\s+([\d ]+,\d{2})\s+(\d+,\d{3,})\s+(\d+,\d{2})\s+(.+)/;

// Code + date at end of a line
const LUSIADAS_SUFFIX_RE = /(\d{3,})\s+(\d{2}\/\d{2}\/\d{4})\s*$/;

// Lines to skip in Lusíadas invoices
const LUSIADAS_SKIP_RE =
  /^(Fatura|Original|\d{4}-\d{2}-\d{2}$|Data de|Nr\.|P.*g\.|Dados|Visão|Convenção|Val\.|IVA |%|Qtd|ud\d|Isento|CLISA|\(1\)|Hospital Lus|www\.|Impresso|Resumo|Carla|Taxa)/;

export function parseLusiadas(text: string): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  const lines = text.split("\n");

  let pending: {
    copay: number;
    totalPrice: number;
    qty: number;
    descStart: string;
  } | null = null;
  const descBuffer: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (LUSIADAS_SKIP_RE.test(line)) continue;
    if (/Contagem e valor/.test(line) || /Total \(€\)/.test(line)) {
      pending = null;
      descBuffer.length = 0;
      continue;
    }

    // Try matching as a data line (starts with numeric prefix)
    const prefixMatch = line.match(LUSIADAS_PREFIX_RE);
    if (prefixMatch) {
      const copay = parsePtDecimal(prefixMatch[1]);
      const totalPrice = parsePtDecimal(prefixMatch[2].replace(/ /g, ""));
      const qty = parsePtDecimal(prefixMatch[4]);
      const rest = prefixMatch[5];

      // Check if the rest has code + date (complete single-line item)
      const suffixMatch = rest.match(LUSIADAS_SUFFIX_RE);
      if (suffixMatch) {
        const description = rest.substring(0, suffixMatch.index!).trim();
        items.push({
          date: suffixMatch[2],
          code: suffixMatch[1],
          description,
          qty,
          unitValue: totalPrice,
          efrValue: Math.round((totalPrice * qty - copay) * 100) / 100,
          clientValue: copay,
        });
        pending = null;
        descBuffer.length = 0;
      } else {
        // Multi-line: description continues on next lines
        pending = { copay, totalPrice, qty, descStart: rest };
        descBuffer.length = 0;
      }
      continue;
    }

    // Continuation line for a pending multi-line item
    if (pending) {
      const suffixMatch = line.match(LUSIADAS_SUFFIX_RE);
      if (suffixMatch) {
        const descEnd = line.substring(0, suffixMatch.index!).trim();
        const fullDesc = [pending.descStart, ...descBuffer, descEnd]
          .filter(Boolean)
          .join(" ")
          .trim();

        items.push({
          date: suffixMatch[2],
          code: suffixMatch[1],
          description: fullDesc,
          qty: pending.qty,
          unitValue: pending.totalPrice,
          efrValue:
            Math.round((pending.totalPrice * pending.qty - pending.copay) * 100) / 100,
          clientValue: pending.copay,
        });
        pending = null;
        descBuffer.length = 0;
      } else {
        descBuffer.push(line);
      }
      continue;
    }

    // Unknown line (section header, etc.) — ignore
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
