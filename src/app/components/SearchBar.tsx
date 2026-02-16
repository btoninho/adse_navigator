"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Fuse from "fuse.js";

interface Procedure {
  code: string;
  designation: string;
  category: string;
  categorySlug: string;
  adseCharge: number;
  copayment: number;
  [key: string]: unknown;
}

interface SearchBarProps {
  procedures: Procedure[];
  placeholder?: string;
  onResults?: (results: Procedure[], query: string) => void;
}

export default function SearchBar({
  procedures,
  placeholder = "Pesquisar por código ou designação…",
  onResults,
}: SearchBarProps) {
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fuse = useMemo(
    () =>
      new Fuse(procedures, {
        keys: [
          { name: "code", weight: 2 },
          { name: "designation", weight: 1 },
        ],
        threshold: 0.35,
        ignoreLocation: true,
        minMatchCharLength: 2,
      }),
    [procedures]
  );

  const doSearch = useCallback(
    (q: string) => {
      if (!onResults) return;
      if (q.trim().length < 2) {
        onResults([], q);
        return;
      }
      const results = fuse.search(q, { limit: 50 }).map((r) => r.item);
      onResults(results, q);
    },
    [fuse, onResults]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-base
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                   placeholder:text-gray-400"
      />
      {query && (
        <button
          onClick={() => {
            setQuery("");
            onResults?.([], "");
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg"
          aria-label="Limpar pesquisa"
        >
          ✕
        </button>
      )}
    </div>
  );
}
