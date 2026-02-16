# ADSE Navegador

Mobile-friendly web app to browse ADSE Regime Convencionado pricing tables.

## Quick Start

```bash
# Install dependencies
npm install

# Parse Excel → JSON (run after updating .xlsx file)
python3 scripts/parse_excel.py

# Validate JSON against Excel source
python3 scripts/validate.py

# Check an invoice PDF against the pricing table
pip install pdfplumber  # one-time
python3 scripts/check_invoice.py path/to/invoice.pdf

# Dev server
npm run dev

# Production build (static export)
npm run build
```

## Deployment

Hosted on Vercel. Auto-deploys on push to `main`.

- **Manual deploy**: `npx vercel --prod`
- **Preview deploy**: `npx vercel`

## Architecture

- **Data pipeline**: `scripts/parse_excel.py` converts the `.xlsx` into `data/*.json` at build time
- **Validation**: `scripts/validate.py` cross-checks every JSON row against the Excel source
- **Frontend**: Next.js App Router with static export (`output: 'export'`)
- **Invoice checker**: Client-side PDF parsing via `pdfjs-dist`, with pluggable provider parsers (`src/lib/invoice-parser.ts`). Python CLI (`scripts/check_invoice.py`) provides the same functionality with `pdfplumber`. Both support CUF and Lusíadas invoices with auto-detection.
- **Search**: fuse.js for client-side fuzzy search (codes + designations)
- **Styling**: Tailwind CSS v4, mobile-first responsive design

## Updating the pricing table

1. Place the new `.xlsx` file in the repo root
2. Run `python3 scripts/parse_excel.py`
3. Run `python3 scripts/validate.py`
4. Commit and push — Vercel deploys automatically

## Adding a new invoice provider

The invoice checker uses a pluggable provider registry. Currently supports **CUF** and **Lusíadas**.

To add a new provider (e.g., Luz Saúde):

1. **TypeScript** (`src/lib/invoice-parser.ts`):
   - Write a parser function: `function parseLuz(text: string): InvoiceItem[] { /* ... */ }`
   - Add to the `PROVIDERS` array: `{ id: "luz", label: "Luz Saúde", detect: (text) => /Luz Saúde/i.test(text), parse: parseLuz }`
2. **Python** (`scripts/check_invoice.py`):
   - Write `extract_luz_items(pdf_path)` function
   - Add the provider to `detect_provider()` and `extract_line_items()`
3. **Tests**: Add expectations to `scripts/test_browser_parser.ts` with a test invoice PDF

**How `reconstructLines` works**: `pdfjs-dist` text items arrive in PDF content stream order, which is not necessarily left-to-right. The `reconstructLines` function groups items by Y position (with ±2 tolerance), then sorts each group by X position. This produces natural left-to-right reading order matching `pdfplumber` output, so both TypeScript and Python parsers use the same column order regexes.

**Space-separated thousands**: Some Lusíadas invoices use spaces as thousands separators (e.g., `"3 150,00"`). The TypeScript Lusíadas parser has two regex patterns — one for space-thousands (`LUSIADAS_LINE_SPACE_RE`) and one standard (`LUSIADAS_LINE_RE`). The space-thousands pattern is tried first since it's more specific.

## Key files

- `scripts/parse_excel.py` — Excel parser
- `scripts/validate.py` — JSON vs Excel cross-check
- `scripts/check_invoice.py` — PDF invoice checker, Python CLI (requires `pdfplumber`)
- `scripts/test_browser_parser.ts` — CI test for the browser-side invoice parser (run with `npx tsx`)
- `data/procedures.json` — All procedures (~3,400 rows)
- `data/rules.json` — Category-specific rules
- `data/metadata.json` — Version info, category counts
- `src/lib/invoice-parser.ts` — Shared invoice parsing logic (provider registry, CUF + Lusíadas parsers, line reconstruction)
- `src/app/page.tsx` — Home page (search + category grid)
- `src/app/category/[slug]/page.tsx` — Category detail page
- `src/app/verificar-fatura/page.tsx` — Invoice checker page
- `src/app/components/InvoiceChecker.tsx` — Invoice checker UI (imports parser from `src/lib/invoice-parser.ts`)
