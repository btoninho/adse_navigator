/**
 * CI test for the browser-side invoice parser.
 *
 * Extracts text from invoice.pdf using pdfjs-dist (same library as the browser),
 * runs it through the shared CUF parser, and asserts the expected results.
 * This catches regressions in the browser parser that the Python CLI wouldn't detect.
 *
 * Usage: npx tsx scripts/test_browser_parser.ts
 */

import { readFileSync } from "fs";
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
const PDF_PATH = resolve(REPO_ROOT, "invoice.pdf");

// Expected results from the test invoice (must match Python CLI output)
const EXPECTED_ITEM_COUNT = 27;
const EXPECTED_CODES = [
  "000000000060",
  "84729",
  "40301",
  "40301",
  "10406",
  "16350",
  "24209",
  "24347",
  "24055",
  "22076",
  "21620",
  "22949",
  "21196",
  "21665",
  "21935",
  "21217",
  "21220",
  "21609",
  "21615",
  "22035",
  "22946",
  "21344",
  "22954",
  "22671",
  "22271",
  "6631",
  "6631",
];

// Spot-check a few items for correct values (code, efrValue, clientValue)
const SPOT_CHECKS: Array<{
  index: number;
  code: string;
  efrValue: number;
  clientValue: number;
}> = [
  { index: 0, code: "000000000060", efrValue: 20.0, clientValue: 20.0 },
  { index: 5, code: "16350", efrValue: 100.0, clientValue: 25.0 },
  { index: 25, code: "6631", efrValue: 3.75, clientValue: 0.94 },
  { index: 26, code: "6631", efrValue: 1.74, clientValue: 0.44 },
];

async function extractText(): Promise<string> {
  const data = new Uint8Array(readFileSync(PDF_PATH));
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

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

async function main() {
  console.log("Testing browser-side invoice parser...\n");

  // Extract text
  const text = await extractText();
  assert(text.length > 0, "PDF text extraction returned empty string");
  console.log(`  Extracted ${text.length} chars from PDF`);

  // Detect provider
  const provider = detectProvider(text);
  assert(provider !== null, "No provider detected");
  assert(provider!.id === "cuf", `Expected CUF provider, got: ${provider!.id}`);
  console.log(`  Provider detected: ${provider!.label}`);

  // Parse items
  const items: InvoiceItem[] = provider!.parse(text);
  console.log(`  Parsed ${items.length} items`);

  // Assert item count
  assert(
    items.length === EXPECTED_ITEM_COUNT,
    `Expected ${EXPECTED_ITEM_COUNT} items, got ${items.length}`,
  );

  // Assert codes match in order
  for (let i = 0; i < EXPECTED_CODES.length; i++) {
    assert(
      items[i].code === EXPECTED_CODES[i],
      `Item ${i}: expected code ${EXPECTED_CODES[i]}, got ${items[i].code}`,
    );
  }
  console.log("  All codes match expected order");

  // Spot-check values
  for (const check of SPOT_CHECKS) {
    const item = items[check.index];
    assert(
      item.code === check.code,
      `Spot check [${check.index}]: expected code ${check.code}, got ${item.code}`,
    );
    assert(
      Math.abs(item.efrValue - check.efrValue) < 0.01,
      `Spot check [${check.index}] ${check.code}: expected efrValue ${check.efrValue}, got ${item.efrValue}`,
    );
    assert(
      Math.abs(item.clientValue - check.clientValue) < 0.01,
      `Spot check [${check.index}] ${check.code}: expected clientValue ${check.clientValue}, got ${item.clientValue}`,
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

  console.log("\nPASS: Browser parser matches expected results.");
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
