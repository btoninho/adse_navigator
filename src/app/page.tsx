"use client";

import { useState } from "react";
import SearchBar from "./components/SearchBar";
import CategoryCard from "./components/CategoryCard";
import ProcedureTable from "./components/ProcedureTable";
import { useTableVersion, type Procedure } from "../lib/TableVersionContext";

export default function HomePage() {
  const { procedures, metadata, loading } = useTableVersion();
  const [searchResults, setSearchResults] = useState<Procedure[]>([]);
  const [query, setQuery] = useState("");

  const handleResults = (results: Procedure[], q: string) => {
    setSearchResults(results);
    setQuery(q);
  };

  const isSearching = query.trim().length >= 2;

  if (loading || !metadata) {
    return (
      <div className="text-center py-12">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" />
        <p className="mt-3 text-sm text-gray-500">A carregar dados…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SearchBar
        procedures={procedures as Procedure[]}
        onResults={handleResults}
      />

      {isSearching ? (
        <div>
          <h2 className="text-sm text-gray-500 mb-3">
            {searchResults.length} resultado{searchResults.length !== 1 ? "s" : ""} para &ldquo;{query}&rdquo;
          </h2>
          <ProcedureTable procedures={searchResults} showCategory />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {metadata.categories.map((cat) => (
            <CategoryCard
              key={cat.slug}
              name={cat.name}
              slug={cat.slug}
              count={cat.count}
            />
          ))}
        </div>
      )}
    </div>
  );
}
