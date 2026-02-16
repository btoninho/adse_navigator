# ADSE Navegador

[![Validate & Build](https://github.com/btoninho/adse_navigator/actions/workflows/validate.yml/badge.svg)](https://github.com/btoninho/adse_navigator/actions/workflows/validate.yml)

Mobile-friendly web app to browse, search, and filter ADSE Regime Convencionado pricing tables.

Search across 3,400+ medical procedure codes, organized in 18 categories, with ADSE charges and beneficiary copayments.

## Features

- **Fuzzy search** — find procedures by code or name, with support for partial words, accented characters, and typos
- **18 categories** — from Análises Clínicas to Cirurgia, Medicina Dentária, and more
- **Category-specific rules** — expandable panel with ADSE-specific rules per category
- **Multi-version pricing tables** — browse and compare data from different table versions (Jun 2024, Jul 2025, Feb 2026) via a global version selector
- **Invoice checker** — validate PDF invoices against the ADSE pricing table, with auto-detection of the correct table version based on invoice date
- **Mobile-first** — card-based layout on mobile, table view on desktop
- **Static site** — no backend needed, deployed on Vercel

## Quick Start

```bash
# Install dependencies
npm install

# Parse all Excel files → versioned JSON
python3 scripts/parse_excel.py

# Dev server
npm run dev

# Production build (static export to out/)
npm run build
```

## Deployment

The site is hosted on [Vercel](https://vercel.com) and auto-deploys on every push to `main`.

- **Production URL**: https://adse-navigator.vercel.app
- **Manual deploy**: `npx vercel --prod`
- **Preview deploy** (without promoting to prod): `npx vercel`

## Updating the Pricing Table

When ADSE publishes a new pricing table:

1. Place the new `.xlsx` file in the repo root (keep previous files for multi-version support)
2. Run `python3 scripts/parse_excel.py` — processes **all** `.xlsx` files and generates versioned data
3. Run `python3 scripts/validate.py` to verify data integrity of the latest version
4. Commit and push — Vercel deploys automatically

```bash
python3 scripts/parse_excel.py
python3 scripts/validate.py
git add data/ public/data/ && git commit -m "Update pricing table" && git push
```

To parse a single file only (backwards compatible):

```bash
python3 scripts/parse_excel.py path/to/new_file.xlsx
```

## Invoice Checker

Verify that a hospital invoice charges the correct ADSE prices:

```bash
pip install pdfplumber  # one-time setup
python3 scripts/check_invoice.py path/to/invoice.pdf
```

The script extracts every line item from the PDF and compares the ADSE charge and beneficiary copayment against the official table. It flags any price differences and handles known exceptions like code 6631 (hospital medications with variable pricing).

The browser-based invoice checker (at `/verificar-fatura`) additionally auto-detects which pricing table version was in effect when the invoice was issued and switches to it automatically.

## Architecture

- **Data pipeline**: `scripts/parse_excel.py` converts all `.xlsx` files into versioned JSON under `public/data/{date}/`, plus `data/*.json` (latest only) for backwards compatibility
- **Version index**: `public/data/versions.json` lists all available table versions with dates and labels
- **Version context**: `src/lib/TableVersionContext.tsx` provides a React context for the current version, with client-side fetching and caching of version data
- **Validation**: `scripts/validate.py` cross-checks `data/*.json` against its source Excel file (auto-detected from `metadata.json`)
- **Frontend**: Next.js App Router with static export (`output: 'export'`)
- **Search**: fuse.js for client-side fuzzy search (codes + designations)
- **Styling**: Tailwind CSS v4, mobile-first responsive design

## Project Structure

```
├── scripts/
│   ├── parse_excel.py       # Excel → JSON parser (all versions)
│   ├── validate.py          # JSON vs Excel cross-check
│   ├── check_invoice.py     # PDF invoice checker (Python CLI)
│   └── test_browser_parser.ts # Browser parser tests
├── data/                    # Latest version only (backwards compat)
│   ├── procedures.json
│   ├── rules.json
│   └── metadata.json
├── public/data/             # All versions (runtime fetch)
│   ├── versions.json        # Version index
│   ├── 2026-02-01/          # Per-version data
│   ├── 2025-07-01/
│   └── 2024-06-01/
├── src/
│   ├── lib/
│   │   ├── TableVersionContext.tsx  # Version context + provider
│   │   └── invoice-parser.ts       # Invoice parsing (CUF, Lusíadas)
│   └── app/
│       ├── layout.tsx              # Root layout (server component)
│       ├── page.tsx                # Home: search + category grid
│       ├── verificar-fatura/
│       │   └── page.tsx            # Invoice checker page
│       ├── category/[slug]/
│       │   ├── page.tsx            # SSG wrapper with generateStaticParams
│       │   └── CategoryPageDynamic.tsx  # Client component with context
│       └── components/
│           ├── AppShell.tsx        # Client wrapper (provider + header + footer)
│           ├── InvoiceChecker.tsx  # Invoice checker UI with auto-version detection
│           ├── SearchBar.tsx       # Fuzzy search with debounce
│           ├── ProcedureTable.tsx  # Responsive table/card view
│           ├── CategoryCard.tsx    # Category tile for home grid
│           ├── CategoryPageClient.tsx  # Category detail UI
│           └── RulesPanel.tsx      # Expandable rules section
```
