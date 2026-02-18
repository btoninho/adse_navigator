/**
 * CI test for the browser-side invoice parser.
 *
 * Extracts text from test invoices using pdfjs-dist (same library as the browser),
 * runs it through the shared parsers, and asserts the expected results.
 * This catches regressions in the browser parser that the Python CLI wouldn't detect.
 *
 * Usage: npx tsx scripts/test_browser_parser.ts
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// pdfjs-dist ships as ESM; use the legacy build for Node compatibility
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

import {
  detectProvider,
  reconstructLines,
  type InvoiceItem,
} from "../src/lib/invoice-parser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    failures++;
  }
}

async function extractText(pdfPath: string): Promise<string> {
  const data = new Uint8Array(readFileSync(pdfPath));
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const textItems = (content.items as Array<{ str?: string; transform?: number[] }>)
      .filter((item): item is { str: string; transform: number[] } => "str" in item);

    pages.push(reconstructLines(textItems).join("\n"));
  }

  return pages.join("\n");
}

interface SpotCheck {
  index: number;
  code: string;
  efrValue: number;
  clientValue: number;
}

async function testInvoice(opts: {
  name: string;
  pdfPath: string;
  expectedProvider: string;
  expectedCount: number;
  expectedCodes: string[];
  spotChecks: SpotCheck[];
}) {
  console.log(`\n[${opts.name}]`);

  if (!existsSync(opts.pdfPath)) {
    console.log(`  SKIP: ${opts.pdfPath} not found`);
    return;
  }

  const text = await extractText(opts.pdfPath);
  assert(text.length > 0, "PDF text extraction returned empty string");
  console.log(`  Extracted ${text.length} chars from PDF`);

  const provider = detectProvider(text);
  assert(provider !== null, "No provider detected");
  assert(
    provider!.id === opts.expectedProvider,
    `Expected ${opts.expectedProvider} provider, got: ${provider!.id}`,
  );
  console.log(`  Provider detected: ${provider!.label}`);

  const items: InvoiceItem[] = provider!.parse(text);
  console.log(`  Parsed ${items.length} items`);

  assert(
    items.length === opts.expectedCount,
    `Expected ${opts.expectedCount} items, got ${items.length}`,
  );

  // Assert codes match in order
  for (let i = 0; i < opts.expectedCodes.length; i++) {
    assert(
      items[i]?.code === opts.expectedCodes[i],
      `Item ${i}: expected code ${opts.expectedCodes[i]}, got ${items[i]?.code}`,
    );
  }
  console.log("  All codes match expected order");

  // Spot-check values
  for (const check of opts.spotChecks) {
    const item = items[check.index];
    assert(
      item?.code === check.code,
      `Spot check [${check.index}]: expected code ${check.code}, got ${item?.code}`,
    );
    assert(
      Math.abs((item?.efrValue ?? 0) - check.efrValue) < 0.01,
      `Spot check [${check.index}] ${check.code}: expected efrValue ${check.efrValue}, got ${item?.efrValue}`,
    );
    assert(
      Math.abs((item?.clientValue ?? 0) - check.clientValue) < 0.01,
      `Spot check [${check.index}] ${check.code}: expected clientValue ${check.clientValue}, got ${item?.clientValue}`,
    );
  }
  console.log("  Spot-check values correct");

  // Assert no empty descriptions
  const emptyDescs = items.filter((item) => !item.description.trim());
  assert(
    emptyDescs.length === 0,
    `${emptyDescs.length} items have empty descriptions: ${emptyDescs.map((i) => i.code).join(", ")}`,
  );
  console.log("  All items have non-empty descriptions");
}

// ---------------------------------------------------------------------------
// Test definitions
// ---------------------------------------------------------------------------

async function main() {
  console.log("Testing browser-side invoice parsers...");

  // --- CUF ---
  await testInvoice({
    name: "CUF",
    pdfPath: resolve(REPO_ROOT, "invoices", "invoice.pdf"),
    expectedProvider: "cuf",
    expectedCount: 27,
    expectedCodes: [
      "000000000060", "84729", "40301", "40301", "10406", "16350",
      "24209", "24347", "24055", "22076", "21620", "22949", "21196",
      "21665", "21935", "21217", "21220", "21609", "21615", "22035",
      "22946", "21344", "22954", "22671", "22271", "6631", "6631",
    ],
    spotChecks: [
      { index: 0, code: "000000000060", efrValue: 20.0, clientValue: 20.0 },
      { index: 5, code: "16350", efrValue: 100.0, clientValue: 25.0 },
      { index: 25, code: "6631", efrValue: 3.75, clientValue: 0.94 },
      { index: 26, code: "6631", efrValue: 1.74, clientValue: 0.44 },
    ],
  });

  // --- CUF (single item, hospital-specific code) ---
  await testInvoice({
    name: "CUF 02",
    pdfPath: resolve(REPO_ROOT, "invoices", "invoice_cuf.pdf"),
    expectedProvider: "cuf",
    expectedCount: 1,
    expectedCodes: ["2000064"],
    spotChecks: [
      { index: 0, code: "2000064", efrValue: 25.0, clientValue: 0.0 },
    ],
  });

  // --- Lusíadas (single consultation) ---
  await testInvoice({
    name: "Lusíadas",
    pdfPath: resolve(REPO_ROOT, "invoices", "invoice-lusiadas.pdf"),
    expectedProvider: "lusiadas",
    expectedCount: 1,
    expectedCodes: ["38"],
    spotChecks: [
      { index: 0, code: "38", efrValue: 28.0, clientValue: 7.0 },
    ],
  });

  // --- Lusíadas 02 (multi-page hospital stay) ---
  await testInvoice({
    name: "Lusíadas 02",
    pdfPath: resolve(REPO_ROOT, "invoices", "invoice-lusiadas02.pdf"),
    expectedProvider: "lusiadas",
    expectedCount: 116,
    expectedCodes: [
      "24380", "24209", "22151", "26062", "26071", "26071", "26224",
      "22954", "21074", "21895", "21458", "22682", "22992", "21396",
      "21101", "21620", "21976", "22271", "22357", "22669", "22949",
      "22076", "21217", "21196", "21220", "21935", "22035", "21665",
      "21340", "21539", "21545", "21554", "22920", "26429", "26431",
      "26433", "26022", "26010", "26025", "26069", "26031", "26006",
      "26271", "22897", "22253", "26047", "26047",
      // Page 3 (repeat labs)
      "22949", "22271", "22669", "21935", "22035", "24209", "21620",
      "22949", "21976", "22271", "22357", "22669", "22640", "22954",
      "26503", "24209", "21620", "22949", "22271", "22669",
      // Ecocardiogram
      "83044",
      // Diárias (medicine + surgery)
      "66757", "66757", "66757", "66757", "66757",
      "76760", "76761", "76760", "76761", "76760", "76761",
      "76759", "76759", "76759", "76759", "76759", "76759",
      "76759", "76759", "76759", "76759", "76759", "76759",
      "76759", "76759", "76759", "76759", "76759", "76759",
      // CTs, surgery, etc.
      "16080", "16070", "16060", "993322", "95737",
      "16080", "16070", "16060", "16325",
      // Anatomia patológica
      "31097",
      // Radiologia
      "10405", "10405", "10406", "10405", "10405", "10405",
      // Transfusões
      "29010", "29410", "29401",
    ],
    spotChecks: [
      { index: 0, code: "24380", efrValue: 0.99, clientValue: 0.26 },
      { index: 67, code: "83044", efrValue: 76.62, clientValue: 19.15 },
      { index: 100, code: "993322", efrValue: 2362.50, clientValue: 787.50 },
      { index: 115, code: "29401", efrValue: 56.78, clientValue: 14.19 },
    ],
  });

  // --- Summary ---
  if (failures > 0) {
    console.error(`\nFAILED: ${failures} assertion(s) failed.`);
    process.exit(1);
  }

  console.log("\nPASS: All browser parser tests passed.");
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
