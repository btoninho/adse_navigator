/**
 * Cross-check: compare Python (pdfplumber) and browser (pdfjs-dist) invoice parsers.
 *
 * Runs both parsers on the same test invoices and asserts they produce
 * identical results (same codes, efrValues, clientValues). This catches
 * drift between the two implementations.
 *
 * Usage: npx tsx scripts/cross_check_parsers.ts
 *
 * Prerequisites: pip install pdfplumber
 */

import { readFileSync, existsSync, writeFileSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { tmpdir } from "os";

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

// ---------------------------------------------------------------------------
// Browser parser (pdfjs-dist)
// ---------------------------------------------------------------------------

async function browserParse(pdfPath: string): Promise<InvoiceItem[]> {
  const data = new Uint8Array(readFileSync(pdfPath));
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const textItems = (
      content.items as Array<{ str?: string; transform?: number[] }>
    ).filter(
      (item): item is { str: string; transform: number[] } => "str" in item,
    );
    pages.push(reconstructLines(textItems).join("\n"));
  }

  const text = pages.join("\n");
  const provider = detectProvider(text);
  if (!provider) return [];
  return provider.parse(text);
}

// ---------------------------------------------------------------------------
// Python parser (pdfplumber via check_invoice.py)
// ---------------------------------------------------------------------------

interface PythonItem {
  code: string;
  efrValue: number;
  clientValue: number;
}

function pythonParse(pdfPath: string): PythonItem[] {
  // Write a temp Python script that imports check_invoice.py's extraction
  const tmpScript = resolve(tmpdir(), `cross_check_${Date.now()}.py`);
  const scriptContent = [
    "import json, sys",
    `sys.path.insert(0, ${JSON.stringify(resolve(REPO_ROOT, "scripts"))})`,
    "from check_invoice import extract_line_items",
    `provider, items = extract_line_items(${JSON.stringify(pdfPath)})`,
    'print(json.dumps([{"code": i["code"], "efrValue": round(i["efrValue"], 2), "clientValue": round(i["clientValue"], 2)} for i in items]))',
  ].join("\n");
  writeFileSync(tmpScript, scriptContent);
  try {
    const output = execSync(`python3 ${JSON.stringify(tmpScript)}`, {
      cwd: REPO_ROOT,
      encoding: "utf-8",
    });
    return JSON.parse(output.trim());
  } finally {
    unlinkSync(tmpScript);
  }
}

// ---------------------------------------------------------------------------
// Cross-check
// ---------------------------------------------------------------------------

async function crossCheck(name: string, pdfPath: string) {
  console.log(`\n[${name}]`);

  if (!existsSync(pdfPath)) {
    console.log(`  SKIP: ${pdfPath} not found`);
    return;
  }

  const browserItems = await browserParse(pdfPath);
  const pythonItems = pythonParse(pdfPath);

  console.log(`  Browser: ${browserItems.length} items`);
  console.log(`  Python:  ${pythonItems.length} items`);

  assert(
    browserItems.length === pythonItems.length,
    `Item count mismatch: browser=${browserItems.length}, python=${pythonItems.length}`,
  );

  const count = Math.min(browserItems.length, pythonItems.length);
  let matched = 0;

  for (let i = 0; i < count; i++) {
    const b = browserItems[i];
    const p = pythonItems[i];

    const codeMatch = b.code === p.code;
    const efrMatch = Math.abs(b.efrValue - p.efrValue) < 0.01;
    const clientMatch = Math.abs(b.clientValue - p.clientValue) < 0.01;

    if (codeMatch && efrMatch && clientMatch) {
      matched++;
    } else {
      const parts: string[] = [];
      if (!codeMatch) parts.push(`code: browser=${b.code}, python=${p.code}`);
      if (!efrMatch)
        parts.push(`efrValue: browser=${b.efrValue}, python=${p.efrValue}`);
      if (!clientMatch)
        parts.push(
          `clientValue: browser=${b.clientValue}, python=${p.clientValue}`,
        );
      assert(false, `Item ${i}: ${parts.join("; ")}`);
    }
  }

  console.log(`  Matched: ${matched}/${count} items`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Cross-checking Python vs browser invoice parsers...");

  await crossCheck("CUF", resolve(REPO_ROOT, "invoice.pdf"));
  await crossCheck("Lusíadas", resolve(REPO_ROOT, "invoice-lusiadas.pdf"));
  await crossCheck("Lusíadas 02", resolve(REPO_ROOT, "invoice-lusiadas02.pdf"));

  if (failures > 0) {
    console.error(`\nFAILED: ${failures} assertion(s) failed.`);
    process.exit(1);
  }

  console.log("\nPASS: Python and browser parsers produce identical results.");
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
