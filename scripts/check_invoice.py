#!/usr/bin/env python3
"""Check an ADSE invoice PDF against the pricing table.

Extracts line items from a CUF-style ADSE invoice and compares the
charged amounts (ADSE portion + beneficiary copayment) against the
official ADSE Regime Convencionado pricing table.

Usage:
    python3 scripts/check_invoice.py path/to/invoice.pdf
"""

import json
import re
import sys
from pathlib import Path

import pdfplumber

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"

# Regex to match invoice line items:
# date  code  description...  qty  unit_value  efr_value  client_value
# Values use Portuguese format: comma as decimal separator
LINE_RE = re.compile(
    r"^(\d{2}/\d{2}/\d{4})\s+"       # date
    r"(\d+)\s+"                        # code
    r"(.+?)\s+"                        # description (greedy but followed by qty)
    r"(\d+\.\d+)\s+"                   # quantity
    r"([\d.,]+)\s+"                    # unit value
    r"([\d.,]+)\s+"                    # EFR (ADSE) value
    r"([\d.,]+)\s*$"                   # client (copayment) value
)

# Some lines have a CHNM/CDM number between description and qty
LINE_WITH_CHNM_RE = re.compile(
    r"^(\d{2}/\d{2}/\d{4})\s+"       # date
    r"(\d+)\s+"                        # code
    r"(.+?)\s+"                        # description
    r"(\d{5,})\s+"                     # CHNM/CDM code (5+ digits)
    r"(\d+\.\d+)\s+"                   # quantity
    r"([\d.,]+)\s+"                    # unit value
    r"([\d.,]+)\s+"                    # EFR value
    r"([\d.,]+)\s*$"                   # client value
)


def parse_pt_decimal(s: str) -> float:
    """Parse Portuguese decimal format (comma as separator)."""
    return float(s.replace(".", "").replace(",", "."))


def extract_line_items(pdf_path: str) -> list[dict]:
    """Extract invoice line items from PDF text."""
    items = []
    pdf = pdfplumber.open(pdf_path)

    for page in pdf.pages:
        text = page.extract_text()
        if not text:
            continue

        lines = text.split("\n")
        i = 0
        while i < len(lines):
            line = lines[i].strip()

            # Try matching with CHNM code first (drugs line)
            m = LINE_WITH_CHNM_RE.match(line)
            if m:
                items.append({
                    "date": m.group(1),
                    "code": m.group(2),
                    "description": m.group(3).strip(),
                    "qty": float(m.group(5)),
                    "unitValue": parse_pt_decimal(m.group(6)),
                    "efrValue": parse_pt_decimal(m.group(7)),
                    "clientValue": parse_pt_decimal(m.group(8)),
                })
                i += 1
                continue

            # Try standard line match
            m = LINE_RE.match(line)
            if m:
                items.append({
                    "date": m.group(1),
                    "code": m.group(2),
                    "description": m.group(3).strip(),
                    "qty": float(m.group(4)),
                    "unitValue": parse_pt_decimal(m.group(5)),
                    "efrValue": parse_pt_decimal(m.group(6)),
                    "clientValue": parse_pt_decimal(m.group(7)),
                })
                i += 1
                continue

            # Check if this is a date+code line where values are on this line
            # but description wraps to next lines (multi-line descriptions)
            date_code_match = re.match(r"^(\d{2}/\d{2}/\d{4})\s+(\d+)\s+(.+)", line)
            if date_code_match:
                # Collect continuation lines until we find values
                full_line = line
                j = i + 1
                while j < len(lines):
                    next_line = lines[j].strip()
                    # Stop if next line starts with a date (new item) or is a section header
                    if re.match(r"^\d{2}/\d{2}/\d{4}", next_line):
                        break
                    if next_line.startswith("Sub-Total") or next_line.startswith("Total"):
                        break
                    if next_line.startswith("Contagem"):
                        break
                    if next_line.startswith("Hospital"):
                        break
                    # Check if this continuation line has the values at the end
                    full_line += " " + next_line
                    j += 1

                    # Try matching the accumulated line
                    m2 = LINE_WITH_CHNM_RE.match(full_line)
                    if m2:
                        items.append({
                            "date": m2.group(1),
                            "code": m2.group(2),
                            "description": m2.group(3).strip(),
                            "qty": float(m2.group(5)),
                            "unitValue": parse_pt_decimal(m2.group(6)),
                            "efrValue": parse_pt_decimal(m2.group(7)),
                            "clientValue": parse_pt_decimal(m2.group(8)),
                        })
                        i = j
                        break

                    m2 = LINE_RE.match(full_line)
                    if m2:
                        items.append({
                            "date": m2.group(1),
                            "code": m2.group(2),
                            "description": m2.group(3).strip(),
                            "qty": float(m2.group(4)),
                            "unitValue": parse_pt_decimal(m2.group(5)),
                            "efrValue": parse_pt_decimal(m2.group(6)),
                            "clientValue": parse_pt_decimal(m2.group(7)),
                        })
                        i = j
                        break
                else:
                    i += 1
                    continue
                continue

            i += 1

    pdf.close()
    return items


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/check_invoice.py <invoice.pdf>", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]
    if not Path(pdf_path).exists():
        print(f"ERROR: File not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    # Codes with variable pricing (actual price depends on the specific item)
    VARIABLE_PRICE_CODES = {"6631"}  # Medicamentos — price varies per drug

    # Load ADSE pricing table
    with open(DATA_DIR / "procedures.json", encoding="utf-8") as f:
        procedures = json.load(f)

    # Build lookup by code (some codes appear in multiple categories)
    proc_by_code: dict[str, list[dict]] = {}
    for p in procedures:
        proc_by_code.setdefault(p["code"], []).append(p)

    # Extract invoice items
    items = extract_line_items(pdf_path)

    if not items:
        print("ERROR: No line items found in PDF.", file=sys.stderr)
        sys.exit(1)

    print(f"Invoice: {Path(pdf_path).name}")
    print(f"Found {len(items)} line items\n")

    # Check each item
    issues = []
    ok_count = 0
    not_found = []
    total_overcharge = 0.0

    print(f"{'Code':<12} {'Description':<45} {'ADSE Chg':>9} {'Copay':>9} {'Status'}")
    print("-" * 95)

    for item in items:
        code = item["code"]
        # Strip leading zeros for lookup
        code_stripped = str(int(code)) if code.isdigit() else code

        matches = proc_by_code.get(code_stripped, [])

        if not matches:
            print(f"{code:<12} {item['description'][:45]:<45} {item['efrValue']:>8.2f}€ {item['clientValue']:>8.2f}€  NOT IN TABLE")
            not_found.append(item)
            continue

        # Variable pricing codes — price depends on the specific item
        if code_stripped in VARIABLE_PRICE_CODES:
            print(f"{code:<12} {item['description'][:45]:<45} {item['efrValue']:>8.2f}€ {item['clientValue']:>8.2f}€  OK (variable pricing)")
            ok_count += 1
            continue

        # Find best match (prefer exact adseCharge match for codes in multiple categories)
        best = None
        for m in matches:
            if abs(m["adseCharge"] - item["efrValue"]) < 0.01:
                best = m
                break
        if best is None:
            best = matches[0]

        expected_adse = best["adseCharge"]
        expected_copay = best["copayment"]
        invoiced_adse = item["efrValue"]
        invoiced_copay = item["clientValue"]

        adse_diff = round(invoiced_adse - expected_adse, 2)
        copay_diff = round(invoiced_copay - expected_copay, 2)

        if abs(adse_diff) < 0.01 and abs(copay_diff) < 0.01:
            print(f"{code:<12} {item['description'][:45]:<45} {invoiced_adse:>8.2f}€ {invoiced_copay:>8.2f}€  OK")
            ok_count += 1
        else:
            status_parts = []
            if abs(adse_diff) >= 0.01:
                sign = "+" if adse_diff > 0 else ""
                status_parts.append(f"ADSE {sign}{adse_diff:.2f}€ (expected {expected_adse:.2f}€)")
            if abs(copay_diff) >= 0.01:
                sign = "+" if copay_diff > 0 else ""
                status_parts.append(f"Copay {sign}{copay_diff:.2f}€ (expected {expected_copay:.2f}€)")
            status = "; ".join(status_parts)
            print(f"{code:<12} {item['description'][:45]:<45} {invoiced_adse:>8.2f}€ {invoiced_copay:>8.2f}€  DIFF: {status}")
            total_overcharge += copay_diff
            issues.append({**item, "expected_adse": expected_adse, "expected_copay": expected_copay,
                           "adse_diff": adse_diff, "copay_diff": copay_diff, "table_entry": best})

    # Summary
    invoice_total = sum(item["clientValue"] for item in items)
    print("\n" + "=" * 95)
    print("SUMMARY")
    print("=" * 95)
    print(f"  Line items:         {len(items)}")
    print(f"  Matching table:     {ok_count}")
    print(f"  Price differences:  {len(issues)}")
    print(f"  Not in table:       {len(not_found)}")
    print(f"  Invoice total:      {invoice_total:.2f}€ (your copayment)")

    if issues:
        print(f"\n  Net copayment difference: {total_overcharge:+.2f}€")
        if total_overcharge > 0:
            print(f"  You were overcharged {total_overcharge:.2f}€ relative to the ADSE table.")
        elif total_overcharge < 0:
            print(f"  You were undercharged {abs(total_overcharge):.2f}€ relative to the ADSE table.")

    if not_found:
        print(f"\n  Codes not in ADSE table: {', '.join(item['code'] for item in not_found)}")
        print("  (These may be hospital-specific codes or urgency surcharges)")

    if not issues and not not_found:
        print("\n  ✓ All charges match the ADSE pricing table.")

    # Exit non-zero only for genuine pricing discrepancies (not variable pricing)
    sys.exit(1 if issues or not_found else 0)


if __name__ == "__main__":
    main()
