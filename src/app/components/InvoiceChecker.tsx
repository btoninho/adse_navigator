"use client";

import { useState, useCallback, useRef } from "react";
import procedures from "../../../data/procedures.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InvoiceItem {
  date: string;
  code: string;
  description: string;
  qty: number;
  unitValue: number;
  efrValue: number;
  clientValue: number;
}

interface CheckedItem extends InvoiceItem {
  status: "ok" | "diff" | "variable" | "not_found";
  expectedAdse?: number;
  expectedCopay?: number;
  adseDiff?: number;
  copayDiff?: number;
  category?: string;
}

interface Procedure {
  code: string;
  designation: string;
  category: string;
  categorySlug: string;
  adseCharge: number;
  copayment: number;
  [key: string]: unknown;
}

type ProviderParser = (text: string) => InvoiceItem[];

// ---------------------------------------------------------------------------
// Provider registry — pluggable structure for future providers
// ---------------------------------------------------------------------------

interface Provider {
  id: string;
  label: string;
  detect: (text: string) => boolean;
  parse: ProviderParser;
}

const PROVIDERS: Provider[] = [
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

// ---------------------------------------------------------------------------
// CUF invoice parser (ported from scripts/check_invoice.py)
// ---------------------------------------------------------------------------

/** Parse Portuguese decimal: "1.234,56" → 1234.56 */
function parsePtDecimal(s: string): number {
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}

// Standard line: date code description qty unitValue efrValue clientValue
const LINE_RE =
  /^(\d{2}\/\d{2}\/\d{4})\s+(\d+)\s+(.+?)\s+(\d+\.\d+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*$/;

// Line with CHNM/CDM code between description and qty
const LINE_WITH_CHNM_RE =
  /^(\d{2}\/\d{2}\/\d{4})\s+(\d+)\s+(.+?)\s+(\d{5,})\s+(\d+\.\d+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*$/;

function itemFromMatch(
  m: RegExpMatchArray,
  hasChnm: boolean,
): InvoiceItem {
  if (hasChnm) {
    return {
      date: m[1],
      code: m[2],
      description: m[3].trim(),
      qty: parseFloat(m[5]),
      unitValue: parsePtDecimal(m[6]),
      efrValue: parsePtDecimal(m[7]),
      clientValue: parsePtDecimal(m[8]),
    };
  }
  return {
    date: m[1],
    code: m[2],
    description: m[3].trim(),
    qty: parseFloat(m[4]),
    unitValue: parsePtDecimal(m[5]),
    efrValue: parsePtDecimal(m[6]),
    clientValue: parsePtDecimal(m[7]),
  };
}

function parseCUF(text: string): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  const lines = text.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Try CHNM match first
    let m = line.match(LINE_WITH_CHNM_RE);
    if (m) {
      items.push(itemFromMatch(m, true));
      i++;
      continue;
    }

    // Try standard match
    m = line.match(LINE_RE);
    if (m) {
      items.push(itemFromMatch(m, false));
      i++;
      continue;
    }

    // Multi-line: date+code on first line, values may be on continuation lines
    const dateCodeMatch = line.match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d+)\s+(.+)/);
    if (dateCodeMatch) {
      let fullLine = line;
      let j = i + 1;
      let found = false;

      while (j < lines.length) {
        const next = lines[j].trim();
        if (/^\d{2}\/\d{2}\/\d{4}/.test(next)) break;
        if (/^(Sub-Total|Total|Contagem|Hospital)/.test(next)) break;

        fullLine += " " + next;
        j++;

        let m2 = fullLine.match(LINE_WITH_CHNM_RE);
        if (m2) {
          items.push(itemFromMatch(m2, true));
          i = j;
          found = true;
          break;
        }
        m2 = fullLine.match(LINE_RE);
        if (m2) {
          items.push(itemFromMatch(m2, false));
          i = j;
          found = true;
          break;
        }
      }

      if (found) continue;
    }

    i++;
  }

  return items;
}

// ---------------------------------------------------------------------------
// Price comparison logic
// ---------------------------------------------------------------------------

const VARIABLE_PRICE_CODES = new Set(["6631"]);

function buildProcLookup(): Map<string, Procedure[]> {
  const map = new Map<string, Procedure[]>();
  for (const p of procedures as Procedure[]) {
    const existing = map.get(p.code) || [];
    existing.push(p);
    map.set(p.code, existing);
  }
  return map;
}

const procByCode = buildProcLookup();

function checkItems(items: InvoiceItem[]): CheckedItem[] {
  return items.map((item) => {
    const codeStripped = String(parseInt(item.code, 10));
    const matches = procByCode.get(codeStripped);

    if (!matches || matches.length === 0) {
      return { ...item, status: "not_found" as const };
    }

    if (VARIABLE_PRICE_CODES.has(codeStripped)) {
      return {
        ...item,
        status: "variable" as const,
        category: matches[0].category,
      };
    }

    // Best match: prefer exact adseCharge match
    let best = matches[0];
    for (const m of matches) {
      if (Math.abs(m.adseCharge - item.efrValue) < 0.01) {
        best = m;
        break;
      }
    }

    const expectedAdse = best.adseCharge;
    const expectedCopay = best.copayment;
    const adseDiff = Math.round((item.efrValue - expectedAdse) * 100) / 100;
    const copayDiff = Math.round((item.clientValue - expectedCopay) * 100) / 100;

    if (Math.abs(adseDiff) < 0.01 && Math.abs(copayDiff) < 0.01) {
      return {
        ...item,
        status: "ok" as const,
        expectedAdse,
        expectedCopay,
        category: best.category,
      };
    }

    return {
      ...item,
      status: "diff" as const,
      expectedAdse,
      expectedCopay,
      adseDiff,
      copayDiff,
      category: best.category,
    };
  });
}

// ---------------------------------------------------------------------------
// PDF text extraction
// ---------------------------------------------------------------------------

async function extractTextFromPDF(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Reconstruct lines by tracking Y positions
    const textItems = content.items
      .filter((item) => "str" in item)
      .map((item) => item as unknown as { str: string; transform: number[] });

    let currentY: number | null = null;
    let currentLine = "";
    const lineTexts: string[] = [];

    for (const item of textItems) {
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

    pages.push(lineTexts.join("\n"));
  }

  return pages.join("\n");
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtCurrency(value: number): string {
  return value.toFixed(2).replace(".", ",") + " €";
}

function fmtDiff(value: number): string {
  const sign = value > 0 ? "+" : "";
  return sign + value.toFixed(2).replace(".", ",") + " €";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type State =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | {
      phase: "results";
      provider: string | null;
      items: CheckedItem[];
      fileName: string;
    };

export default function InvoiceChecker() {
  const [state, setState] = useState<State>({ phase: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const processFile = useCallback(async (file: File) => {
    if (file.type !== "application/pdf") {
      setState({ phase: "error", message: "Por favor selecione um ficheiro PDF." });
      return;
    }

    setState({ phase: "loading" });

    try {
      const text = await extractTextFromPDF(file);

      // Detect provider
      const provider = PROVIDERS.find((p) => p.detect(text));

      if (!provider) {
        setState({
          phase: "error",
          message:
            "Formato de fatura não reconhecido. Prestadores suportados: " +
            PROVIDERS.map((p) => p.label).join(", ") +
            ".",
        });
        return;
      }

      const rawItems = provider.parse(text);

      if (rawItems.length === 0) {
        setState({
          phase: "error",
          message: `Fatura ${provider.label} detetada, mas não foi possível extrair itens. O formato da fatura pode ter sido alterado.`,
        });
        return;
      }

      const checkedItems = checkItems(rawItems);
      setState({
        phase: "results",
        provider: provider.label,
        items: checkedItems,
        fileName: file.name,
      });
    } catch (err) {
      console.error("PDF processing error:", err);
      setState({
        phase: "error",
        message: "Erro ao processar o PDF. Verifique que o ficheiro não está corrompido.",
      });
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const reset = () => {
    setState({ phase: "idle" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Compute summary
  const summary =
    state.phase === "results"
      ? {
          total: state.items.length,
          ok: state.items.filter(
            (i) => i.status === "ok" || i.status === "variable",
          ).length,
          diff: state.items.filter((i) => i.status === "diff").length,
          notFound: state.items.filter((i) => i.status === "not_found").length,
          overcharge: state.items
            .filter((i) => i.status === "diff")
            .reduce((sum, i) => sum + (i.copayDiff ?? 0), 0),
        }
      : null;

  return (
    <div className="space-y-6">
      {/* Upload zone */}
      {(state.phase === "idle" || state.phase === "error") && (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              dragOver
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 bg-white hover:border-gray-400"
            }`}
          >
            <div className="space-y-3">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
              <div>
                <p className="text-sm text-gray-600">
                  Arraste um ficheiro PDF ou{" "}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-blue-600 font-medium hover:text-blue-700 underline"
                  >
                    escolha do computador
                  </button>
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Faturas ADSE de prestadores convencionados
                </p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          <p className="text-xs text-gray-400 text-center">
            O ficheiro é processado localmente no seu browser. Nenhum dado é
            enviado para servidores.
          </p>
        </>
      )}

      {/* Error */}
      {state.phase === "error" && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm text-amber-800">{state.message}</p>
        </div>
      )}

      {/* Loading */}
      {state.phase === "loading" && (
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" />
          <p className="mt-3 text-sm text-gray-500">A processar fatura…</p>
        </div>
      )}

      {/* Results */}
      {state.phase === "results" && summary && (
        <>
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">{state.fileName}</h2>
              {state.provider && (
                <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                  {state.provider}
                </span>
              )}
            </div>
            <button
              onClick={reset}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Nova fatura
            </button>
          </div>

          {/* Summary bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="Total itens" value={String(summary.total)} />
            <SummaryCard
              label="Corretos"
              value={String(summary.ok)}
              color="green"
            />
            <SummaryCard
              label="Diferenças"
              value={String(summary.diff)}
              color={summary.diff > 0 ? "amber" : "green"}
            />
            <SummaryCard
              label="Sobrecusto"
              value={
                summary.overcharge > 0
                  ? "+" + fmtCurrency(summary.overcharge)
                  : fmtCurrency(0)
              }
              color={summary.overcharge > 0 ? "red" : "green"}
            />
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="pb-2 pr-3 font-medium">Código</th>
                  <th className="pb-2 pr-3 font-medium">Designação</th>
                  <th className="pb-2 pr-3 font-medium text-right">ADSE Faturado</th>
                  <th className="pb-2 pr-3 font-medium text-right">ADSE Tabela</th>
                  <th className="pb-2 pr-3 font-medium text-right">Copag. Faturado</th>
                  <th className="pb-2 pr-3 font-medium text-right">Copag. Tabela</th>
                  <th className="pb-2 font-medium text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((item, i) => (
                  <tr
                    key={`${item.code}-${i}`}
                    className={`border-b border-gray-100 ${statusRowBg(item.status)}`}
                  >
                    <td className="py-2 pr-3 font-mono text-xs text-gray-600">
                      {item.code}
                    </td>
                    <td className="py-2 pr-3">{item.description}</td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      {fmtCurrency(item.efrValue)}
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      {item.expectedAdse != null
                        ? fmtCurrency(item.expectedAdse)
                        : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      {fmtCurrency(item.clientValue)}
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      {item.expectedCopay != null
                        ? fmtCurrency(item.expectedCopay)
                        : "—"}
                    </td>
                    <td className="py-2 text-center">
                      <StatusBadge item={item} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {state.items.map((item, i) => (
              <div
                key={`${item.code}-${i}`}
                className={`rounded-lg border p-3 ${statusCardBorder(item.status)}`}
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-gray-500">
                        {item.code}
                      </span>
                      <StatusBadge item={item} />
                    </div>
                    <p className="text-sm font-medium leading-tight mt-0.5">
                      {item.description}
                    </p>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-400">ADSE faturado</span>
                    <p className="font-medium">{fmtCurrency(item.efrValue)}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">ADSE tabela</span>
                    <p className="font-medium">
                      {item.expectedAdse != null
                        ? fmtCurrency(item.expectedAdse)
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-400">Copag. faturado</span>
                    <p className="font-medium">
                      {fmtCurrency(item.clientValue)}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-400">Copag. tabela</span>
                    <p className="font-medium">
                      {item.expectedCopay != null
                        ? fmtCurrency(item.expectedCopay)
                        : "—"}
                    </p>
                  </div>
                </div>
                {item.status === "diff" && (
                  <div className="mt-2 text-xs text-amber-700">
                    {item.adseDiff != null && Math.abs(item.adseDiff) >= 0.01 && (
                      <span>ADSE: {fmtDiff(item.adseDiff)} </span>
                    )}
                    {item.copayDiff != null && Math.abs(item.copayDiff) >= 0.01 && (
                      <span>Copag: {fmtDiff(item.copayDiff)}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400 text-center">
            O ficheiro é processado localmente no seu browser. Nenhum dado é
            enviado para servidores.
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: "green" | "amber" | "red";
}) {
  const colorClasses = {
    green: "bg-green-50 border-green-200",
    amber: "bg-amber-50 border-amber-200",
    red: "bg-red-50 border-red-200",
  };

  return (
    <div
      className={`rounded-lg border p-3 ${
        color ? colorClasses[color] : "bg-white border-gray-200"
      }`}
    >
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold mt-0.5">{value}</p>
    </div>
  );
}

function StatusBadge({ item }: { item: CheckedItem }) {
  switch (item.status) {
    case "ok":
      return (
        <span className="inline-block text-xs font-medium bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
          OK
        </span>
      );
    case "variable":
      return (
        <span className="inline-block text-xs font-medium bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
          OK (variável)
        </span>
      );
    case "diff":
      return (
        <span className="inline-block text-xs font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
          Diferença
        </span>
      );
    case "not_found":
      return (
        <span className="inline-block text-xs font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
          Não encontrado
        </span>
      );
  }
}

function statusRowBg(status: CheckedItem["status"]): string {
  switch (status) {
    case "ok":
    case "variable":
      return "hover:bg-green-50/50";
    case "diff":
      return "bg-amber-50/30 hover:bg-amber-50/60";
    case "not_found":
      return "hover:bg-gray-50/50";
  }
}

function statusCardBorder(status: CheckedItem["status"]): string {
  switch (status) {
    case "ok":
    case "variable":
      return "border-green-200 bg-white";
    case "diff":
      return "border-amber-200 bg-amber-50/30";
    case "not_found":
      return "border-gray-200 bg-white";
  }
}
