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
- **Invoice checker**: Client-side PDF parsing via `pdfjs-dist`, with pluggable provider parsers (`src/lib/invoice-parser.ts`)
- **Search**: fuse.js for client-side fuzzy search (codes + designations)
- **Styling**: Tailwind CSS v4, mobile-first responsive design

## Updating the pricing table

1. Place the new `.xlsx` file in the repo root
2. Run `python3 scripts/parse_excel.py`
3. Run `python3 scripts/validate.py`
4. Commit and push — Vercel deploys automatically

## Adding a new invoice provider

The invoice checker uses a pluggable provider registry in `src/lib/invoice-parser.ts`. Each provider defines how to detect and parse its invoice format. Currently only CUF is supported.

To add a new provider (e.g., Luz Saúde):

1. Write a parser function in `src/lib/invoice-parser.ts` that takes the full PDF text and returns `InvoiceItem[]`:
   ```ts
   function parseLuz(text: string): InvoiceItem[] { /* ... */ }
   ```
2. Add an entry to the `PROVIDERS` array in `src/lib/invoice-parser.ts`:
   ```ts
   { id: "luz", label: "Luz Saúde", detect: (text) => /Luz Saúde/i.test(text), parse: parseLuz }
   ```
   - `detect` — returns `true` if the PDF text belongs to this provider (match on known strings like the provider name)
   - `parse` — extracts line items using regex patterns specific to that provider's invoice layout
3. Add test expectations to `scripts/test_browser_parser.ts` if you have a test invoice

The app auto-detects the provider by running each `detect` function against the PDF text. If no provider matches, it shows "Formato de fatura não reconhecido".

**Important**: `pdfjs-dist` (browser) renders text in a different column order than `pdfplumber` (Python CLI). Always inspect `pdfjs-dist` output for a new provider before writing regex patterns — don't assume the same layout as the Python parser.

## Key files

- `scripts/parse_excel.py` — Excel parser
- `scripts/validate.py` — JSON vs Excel cross-check
- `scripts/check_invoice.py` — PDF invoice checker, Python CLI (requires `pdfplumber`)
- `scripts/test_browser_parser.ts` — CI test for the browser-side invoice parser (run with `npx tsx`)
- `data/procedures.json` — All procedures (~3,400 rows)
- `data/rules.json` — Category-specific rules
- `data/metadata.json` — Version info, category counts
- `src/lib/invoice-parser.ts` — Shared invoice parsing logic (provider registry, CUF parser, line reconstruction)
- `src/app/page.tsx` — Home page (search + category grid)
- `src/app/category/[slug]/page.tsx` — Category detail page
- `src/app/verificar-fatura/page.tsx` — Invoice checker page
- `src/app/components/InvoiceChecker.tsx` — Invoice checker UI (imports parser from `src/lib/invoice-parser.ts`)
