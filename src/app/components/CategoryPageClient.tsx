"use client";

import { useState, useMemo } from "react";
import SearchBar from "./SearchBar";
import ProcedureTable from "./ProcedureTable";
import RulesPanel from "./RulesPanel";

interface Procedure {
  code: string;
  designation: string;
  category: string;
  categorySlug: string;
  adseCharge: number;
  copayment: number;
  [key: string]: unknown;
}

interface CategoryInfo {
  name: string;
  slug: string;
  count: number;
}

const POSSIBLE_EXTRAS = [
  "maxQuantity",
  "period",
  "hospitalizationDays",
  "codeType",
  "smallSurgery",
  "observations",
] as const;

export default function CategoryPageClient({
  categoryInfo,
  procedures,
  rules,
}: {
  categoryInfo: CategoryInfo;
  procedures: Procedure[];
  rules: string[];
}) {
  const extraColumns = useMemo(() => {
    return POSSIBLE_EXTRAS.filter((col) =>
      procedures.some(
        (p) => p[col] != null && p[col] !== "" && p[col] !== false
      )
    );
  }, [procedures]);

  const [searchResults, setSearchResults] = useState<Procedure[]>([]);
  const [query, setQuery] = useState("");

  const handleResults = (results: Procedure[], q: string) => {
    setSearchResults(results);
    setQuery(q);
  };

  const isSearching = query.trim().length >= 2;
  const displayedProcedures = isSearching ? searchResults : procedures;

  return (
    <div className="space-y-4">
      <div>
        <a href="/" className="text-sm text-blue-600 hover:underline">
          ← Todas as categorias
        </a>
        <h1 className="text-xl font-bold text-gray-900 mt-1">
          {categoryInfo.name}
        </h1>
        <p className="text-sm text-gray-500">
          {categoryInfo.count} procedimento{categoryInfo.count !== 1 ? "s" : ""}
        </p>
      </div>

      <RulesPanel rules={rules} />

      <SearchBar
        procedures={procedures}
        placeholder={`Pesquisar em ${categoryInfo.name}…`}
        onResults={handleResults}
      />

      {isSearching && (
        <p className="text-sm text-gray-500">
          {searchResults.length} resultado
          {searchResults.length !== 1 ? "s" : ""}
        </p>
      )}

      <ProcedureTable
        procedures={displayedProcedures}
        extraColumns={extraColumns}
      />
    </div>
  );
}
