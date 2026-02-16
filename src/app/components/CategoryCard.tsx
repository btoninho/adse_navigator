interface CategoryCardProps {
  name: string;
  slug: string;
  count: number;
}

export default function CategoryCard({ name, slug, count }: CategoryCardProps) {
  return (
    <a
      href={`/category/${slug}`}
      className="block bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-400
                 hover:shadow-md transition-all"
    >
      <h2 className="font-semibold text-sm text-gray-800 leading-tight">
        {name}
      </h2>
      <p className="mt-1 text-xs text-gray-500">
        {count} procedimento{count !== 1 ? "s" : ""}
      </p>
    </a>
  );
}
