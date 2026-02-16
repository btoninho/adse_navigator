# ADSE Sanity

Mobile-friendly web app to browse ADSE Regime Convencionado pricing tables.

## Quick Start

```bash
# Parse Excel → JSON (run after updating .xlsx file)
python3 scripts/parse_excel.py

# Dev server
npm run dev

# Production build (static export)
npm run build
```

## Architecture

- **Data pipeline**: `scripts/parse_excel.py` converts the `.xlsx` into `data/*.json` at build time
- **Frontend**: Next.js App Router with static export (`output: 'export'`)
- **Search**: fuse.js for client-side fuzzy search (codes + designations)
- **Styling**: Tailwind CSS v4, mobile-first responsive design

## Updating the pricing table

1. Place the new `.xlsx` file in the repo root
2. Run `python3 scripts/parse_excel.py`
3. Run `npm run build`

## Key files

- `scripts/parse_excel.py` — Excel parser
- `data/procedures.json` — All procedures (~3,400 rows)
- `data/rules.json` — Category-specific rules
- `data/metadata.json` — Version info, category counts
- `src/app/page.tsx` — Home page (search + category grid)
- `src/app/category/[slug]/page.tsx` — Category detail page
