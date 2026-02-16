import metadata from "../../../../data/metadata.json";
import CategoryPageDynamic from "./CategoryPageDynamic";

export function generateStaticParams() {
  return metadata.categories.map((cat) => ({ slug: cat.slug }));
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <CategoryPageDynamic slug={slug} />;
}
