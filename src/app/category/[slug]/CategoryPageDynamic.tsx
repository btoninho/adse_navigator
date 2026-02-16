"use client";

import { useMemo } from "react";
import CategoryPageClient from "../../components/CategoryPageClient";
import { useTableVersion, type RuleGroup } from "../../../lib/TableVersionContext";

export default function CategoryPageDynamic({ slug }: { slug: string }) {
  const { procedures, rules, metadata, loading } = useTableVersion();

  const categoryInfo = useMemo(
    () => metadata?.categories.find((c) => c.slug === slug) ?? null,
    [metadata, slug],
  );

  const filteredProcedures = useMemo(
    () => procedures.filter((p) => p.categorySlug === slug),
    [procedures, slug],
  );

  const categoryRules = useMemo(
    () => (rules as RuleGroup[]).find((r) => r.slug === slug)?.rules ?? [],
    [rules, slug],
  );

  if (loading || !metadata) {
    return (
      <div className="text-center py-12">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" />
        <p className="mt-3 text-sm text-gray-500">A carregar dados…</p>
      </div>
    );
  }

  if (!categoryInfo) {
    return (
      <div className="text-center py-12">
        <h1 className="text-xl font-bold text-gray-800">
          Categoria não encontrada
        </h1>
        <a href="/" className="text-blue-600 mt-4 inline-block">
          ← Voltar ao início
        </a>
      </div>
    );
  }

  return (
    <CategoryPageClient
      categoryInfo={categoryInfo}
      procedures={filteredProcedures}
      rules={categoryRules}
    />
  );
}
