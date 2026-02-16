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
- **Search**: fuse.js for client-side fuzzy search (codes + designations)
- **Styling**: Tailwind CSS v4, mobile-first responsive design

## Updating the pricing table

1. Place the new `.xlsx` file in the repo root
2. Run `python3 scripts/parse_excel.py`
3. Run `python3 scripts/validate.py`
4. Commit and push — Vercel deploys automatically

## Adding a new invoice provider

The invoice checker (`src/app/components/InvoiceChecker.tsx`) uses a pluggable provider registry. Each provider defines how to detect and parse its invoice format. Currently only CUF is supported.

To add a new provider (e.g., Luz Saúde):

1. Write a parser function that takes the full PDF text and returns `InvoiceItem[]`:
   ```ts
   function parseLuz(text: string): InvoiceItem[] { /* ... */ }
   ```
2. Add an entry to the `PROVIDERS` array in `InvoiceChecker.tsx`:
   ```ts
   { id: "luz", label: "Luz Saúde", detect: (text) => /Luz Saúde/i.test(text), parse: parseLuz }
   ```
   - `detect` — returns `true` if the PDF text belongs to this provider (match on known strings like the provider name)
   - `parse` — extracts line items using regex patterns specific to that provider's invoice layout

The app auto-detects the provider by running each `detect` function against the PDF text. If no provider matches, it shows "Formato de fatura não reconhecido".

## Key files

- `scripts/parse_excel.py` — Excel parser
- `scripts/validate.py` — JSON vs Excel cross-check
- `scripts/check_invoice.py` — PDF invoice checker (requires `pdfplumber`)
- `data/procedures.json` — All procedures (~3,400 rows)
- `data/rules.json` — Category-specific rules
- `data/metadata.json` — Version info, category counts
- `src/app/page.tsx` — Home page (search + category grid)
- `src/app/category/[slug]/page.tsx` — Category detail page
- `src/app/verificar-fatura/page.tsx` — Invoice checker page
- `src/app/components/InvoiceChecker.tsx` — Invoice parsing, comparison & UI (provider registry lives here)
