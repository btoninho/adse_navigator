# ADSE Navegador

Mobile-friendly web app to browse ADSE Regime Convencionado pricing tables.

## Quick Start

```bash
# Install dependencies
npm install

# Parse all Excel files → versioned JSON
python3 scripts/parse_excel.py

# Validate latest JSON against its Excel source
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

- **Data pipeline**: `scripts/parse_excel.py` processes **all** `.xlsx` files in the repo root and outputs:
  - `data/*.json` — latest version only (backwards compat for `validate.py` and `check_invoice.py`)
  - `public/data/{date}/` — per-version `procedures.json`, `rules.json`, `metadata.json`
  - `public/data/versions.json` — index of all available versions with dates and labels
- **Version context**: `src/lib/TableVersionContext.tsx` — React context that loads version data from `public/data/` at runtime, with a `Map`-based cache to avoid re-fetching. Provides `useTableVersion()` hook for all data consumers.
- **App shell**: `src/app/components/AppShell.tsx` — client component wrapping `TableVersionProvider` + header (with version `<select>` dropdown) + footer. `layout.tsx` stays as a server component for metadata generation.
- **Validation**: `scripts/validate.py` cross-checks `data/*.json` against its source Excel file (auto-detected from `data/metadata.json`)
- **Frontend**: Next.js App Router with static export (`output: 'export'`)
- **Invoice checker**: Client-side PDF parsing via `pdfjs-dist`, with pluggable provider parsers (`src/lib/invoice-parser.ts`). Auto-detects the correct pricing table version from invoice dates. Python CLI (`scripts/check_invoice.py`) provides the same functionality with `pdfplumber`. Both support CUF and Lusíadas invoices with auto-detection.
- **Search**: fuse.js for client-side fuzzy search (codes + designations)
- **Styling**: Tailwind CSS v4, mobile-first responsive design

## Multi-version pricing tables

The app supports multiple pricing table versions (currently Jun 2024, Jul 2025, Feb 2026). All `.xlsx` files in the repo root are processed by `parse_excel.py`.

- **Version selector**: dropdown in the header switches the active table globally
- **Invoice auto-detection**: when checking an invoice, the earliest item date determines which table was in effect (`latest versionDate ≤ invoiceDate`), and the app switches automatically with a visible banner
- **Caching**: loaded versions are cached in a `Map` — switching back to a previously viewed version is instant

### Data flow

1. `parse_excel.py` reads all `.xlsx` files → writes `public/data/{date}/` + `public/data/versions.json`
2. On page load, `TableVersionProvider` fetches `versions.json` then loads the latest version's data
3. `setVersion(date)` fetches a different version's JSON (or returns cached data)
4. All pages (`page.tsx`, `CategoryPageDynamic.tsx`, `InvoiceChecker.tsx`) consume data via `useTableVersion()`

## Updating the pricing table

1. Place the new `.xlsx` file in the repo root (keep previous files for multi-version support)
2. Run `python3 scripts/parse_excel.py`
3. Run `python3 scripts/validate.py`
4. Commit `data/`, `public/data/`, and push — Vercel deploys automatically

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

- `scripts/parse_excel.py` — Excel parser (processes all xlsx files, outputs versioned data)
- `scripts/validate.py` — JSON vs Excel cross-check (auto-detects source from `metadata.json`)
- `scripts/check_invoice.py` — PDF invoice checker, Python CLI (requires `pdfplumber`)
- `scripts/test_browser_parser.ts` — CI test for the browser-side invoice parser (run with `npx tsx`)
- `public/data/versions.json` — Index of all available pricing table versions
- `public/data/{date}/` — Per-version procedures, rules, and metadata JSON
- `data/procedures.json` — Latest version procedures (~3,400 rows, backwards compat)
- `data/rules.json` — Latest version category-specific rules
- `data/metadata.json` — Latest version info, category counts
- `src/lib/TableVersionContext.tsx` — React context for version state, data fetching, and caching
- `src/lib/invoice-parser.ts` — Shared invoice parsing logic (provider registry, CUF + Lusíadas parsers, line reconstruction)
- `src/app/layout.tsx` — Root layout (server component, static metadata)
- `src/app/components/AppShell.tsx` — Client wrapper with `TableVersionProvider`, header with version selector, footer
- `src/app/page.tsx` — Home page (search + category grid, uses context)
- `src/app/category/[slug]/page.tsx` — Category SSG wrapper with `generateStaticParams`
- `src/app/category/[slug]/CategoryPageDynamic.tsx` — Category detail client component (uses context)
- `src/app/verificar-fatura/page.tsx` — Invoice checker page
- `src/app/components/InvoiceChecker.tsx` — Invoice checker UI (uses context, auto-detects version from invoice dates)
