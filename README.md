# ADSE Navigator

Mobile-friendly web app to browse, search, and filter ADSE Regime Convencionado pricing tables.

Search across 3,400+ medical procedure codes, organized in 18 categories, with ADSE charges and beneficiary copayments.

## Features

- **Fuzzy search** — find procedures by code or name, with support for partial words, accented characters, and typos
- **18 categories** — from Análises Clínicas to Cirurgia, Medicina Dentária, and more
- **Category-specific rules** — expandable panel with ADSE-specific rules per category
- **Mobile-first** — card-based layout on mobile, table view on desktop
- **Static site** — no backend needed, deploy anywhere

## Quick Start

```bash
# Install dependencies
npm install

# Parse Excel → JSON (run after updating .xlsx file)
python3 scripts/parse_excel.py

# Dev server
npm run dev

# Production build (static export to out/)
npm run build
```

## Updating the Pricing Table

When ADSE publishes a new pricing table:

1. Place the new `.xlsx` file in the repo root
2. Run `python3 scripts/parse_excel.py`
3. Run `python3 scripts/validate.py` to verify data integrity
4. Run `npm run build`
5. Deploy the `out/` folder

## Architecture

- **Data pipeline**: `scripts/parse_excel.py` converts the `.xlsx` into `data/*.json` at build time
- **Validation**: `scripts/validate.py` cross-checks every JSON row against the Excel source
- **Frontend**: Next.js App Router with static export (`output: 'export'`)
- **Search**: fuse.js for client-side fuzzy search (codes + designations)
- **Styling**: Tailwind CSS v4, mobile-first responsive design

## Project Structure

```
├── scripts/
│   ├── parse_excel.py       # Excel → JSON parser
│   └── validate.py          # JSON vs Excel cross-check
├── data/
│   ├── procedures.json      # All procedures (~3,400 rows)
│   ├── rules.json           # Category-specific rules
│   └── metadata.json        # Version info, category counts
├── src/app/
│   ├── layout.tsx            # Root layout with version badge
│   ├── page.tsx              # Home: search + category grid
│   ├── category/[slug]/
│   │   └── page.tsx          # Category detail page
│   └── components/
│       ├── SearchBar.tsx     # Fuzzy search with debounce
│       ├── ProcedureTable.tsx# Responsive table/card view
│       ├── CategoryCard.tsx  # Category tile for home grid
│       ├── CategoryPageClient.tsx
│       └── RulesPanel.tsx    # Expandable rules section
```
