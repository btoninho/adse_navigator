"use client";

import { useState } from "react";
import SearchBar from "./components/SearchBar";
import CategoryCard from "./components/CategoryCard";
import ProcedureTable from "./components/ProcedureTable";
import procedures from "../../data/procedures.json";
import metadata from "../../data/metadata.json";

interface Procedure {
  code: string;
  designation: string;
  category: string;
  categorySlug: string;
  adseCharge: number;
  copayment: number;
  [key: string]: unknown;
}

export default function HomePage() {
  const [searchResults, setSearchResults] = useState<Procedure[]>([]);
  const [query, setQuery] = useState("");

  const handleResults = (results: Procedure[], q: string) => {
    setSearchResults(results);
    setQuery(q);
  };

  const isSearching = query.trim().length >= 2;

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
