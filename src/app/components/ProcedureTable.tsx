"use client";

interface Procedure {
  code: string;
  designation: string;
  category: string;
  categorySlug: string;
  subcategory?: string;
  adseCharge: number;
  copayment: number;
  copaymentNote?: string;
  maxQuantity?: number;
  period?: string;
  hospitalizationDays?: number;
  codeType?: string;
  smallSurgery?: boolean;
  observations?: string;
  [key: string]: unknown;
}

interface ProcedureTableProps {
  procedures: Procedure[];
  showCategory?: boolean;
  extraColumns?: string[];
}

function formatCurrency(value: number): string {
  return value.toFixed(2).replace(".", ",") + " €";
}

const EXTRA_COL_LABELS: Record<string, string> = {
  maxQuantity: "Qt. Máx.",
  period: "Prazo",
  hospitalizationDays: "Dias Int.",
  codeType: "Tipo",
  smallSurgery: "Peq. Cir.",
  observations: "Obs.",
};

export default function ProcedureTable({
  procedures,
  showCategory = false,
  extraColumns = [],
}: ProcedureTableProps) {
  if (procedures.length === 0) {
    return (
      <p className="text-gray-500 text-center py-8">
        Nenhum procedimento encontrado.
      </p>
    );
  }

  // Mobile: card layout
  // Desktop: table layout
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="pb-2 pr-3 font-medium">Código</th>
              <th className="pb-2 pr-3 font-medium">Designação</th>
              {showCategory && (
                <th className="pb-2 pr-3 font-medium">Categoria</th>
              )}
              {extraColumns.map((col) => (
                <th key={col} className="pb-2 pr-3 font-medium whitespace-nowrap">
                  {EXTRA_COL_LABELS[col] || col}
                </th>
              ))}
              <th className="pb-2 pr-3 font-medium text-right">ADSE</th>
              <th className="pb-2 font-medium text-right">Copag.</th>
            </tr>
          </thead>
          <tbody>
            {procedures.map((p, i) => (
              <tr
                key={`${p.code}-${i}`}
                className="border-b border-gray-100 hover:bg-blue-50/50"
              >
                <td className="py-2 pr-3 font-mono text-xs text-gray-600">
                  {p.code}
                </td>
                <td className="py-2 pr-3">{p.designation}</td>
                {showCategory && (
                  <td className="py-2 pr-3 text-xs text-gray-500">
                    <a
                      href={`/category/${p.categorySlug}`}
                      className="hover:text-blue-600"
                    >
                      {p.category}
                    </a>
                  </td>
                )}
                {extraColumns.map((col) => (
                  <td key={col} className="py-2 pr-3 text-xs text-gray-600 whitespace-nowrap">
                    {col === "smallSurgery"
                      ? p[col]
                        ? "Sim"
                        : ""
                      : (p[col] as string | number) ?? ""}
                  </td>
                ))}
                <td className="py-2 pr-3 text-right whitespace-nowrap font-medium">
                  {formatCurrency(p.adseCharge)}
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  {p.copaymentNote || formatCurrency(p.copayment)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {procedures.map((p, i) => (
          <div
            key={`${p.code}-${i}`}
            className="bg-white rounded-lg border border-gray-200 p-3"
          >
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1 min-w-0">
                <span className="font-mono text-xs text-gray-500">{p.code}</span>
                <p className="text-sm font-medium leading-tight mt-0.5">
                  {p.designation}
                </p>
                {showCategory && (
                  <a
                    href={`/category/${p.categorySlug}`}
                    className="text-xs text-blue-600 mt-0.5 inline-block"
                  >
                    {p.category}
                  </a>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-blue-700">
                  {formatCurrency(p.adseCharge)}
                </p>
                <p className="text-xs text-gray-500">
                  copag. {p.copaymentNote || formatCurrency(p.copayment)}
                </p>
              </div>
            </div>
            {extraColumns.some((col) => p[col] != null && p[col] !== "" && p[col] !== false) && (
              <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                {extraColumns.map((col) => {
                  const val = p[col];
                  if (val == null || val === "" || val === false) return null;
                  const display = col === "smallSurgery" ? "Sim" : String(val);
                  return (
                    <span key={col}>
                      {EXTRA_COL_LABELS[col]}: {display}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
