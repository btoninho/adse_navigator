import CategoryPageClient from "../../components/CategoryPageClient";
import allProcedures from "../../../../data/procedures.json";
import allRules from "../../../../data/rules.json";
import metadata from "../../../../data/metadata.json";

interface Procedure {
  code: string;
  designation: string;
  category: string;
  categorySlug: string;
  adseCharge: number;
  copayment: number;
  [key: string]: unknown;
}

interface RuleGroup {
  category: string;
  slug: string;
  rules: string[];
}

export function generateStaticParams() {
  return metadata.categories.map((cat) => ({ slug: cat.slug }));
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const categoryInfo = metadata.categories.find((c) => c.slug === slug);

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

  const procedures = (allProcedures as Procedure[]).filter(
    (p) => p.categorySlug === slug
  );
  const rules =
    (allRules as RuleGroup[]).find((r) => r.slug === slug)?.rules ?? [];

  return (
    <CategoryPageClient
      categoryInfo={categoryInfo}
      procedures={procedures}
      rules={rules}
    />
  );
}
