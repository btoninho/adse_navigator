import type { Metadata } from "next";
import "./globals.css";
import metadata from "../../data/metadata.json";

export const generateMetadata = (): Metadata => ({
  title: "ADSE Navegador — Tabela Regime Convencionado",
  description: `Pesquise ${metadata.totalProcedures} procedimentos ADSE em ${metadata.categories.length} categorias. Tabela de ${metadata.tableDate}.`,
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt">
      <body className="bg-gray-50 text-gray-900 antialiased min-h-screen flex flex-col">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <a href="/" className="font-bold text-lg text-blue-700">
              ADSE Navegador
            </a>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
              Tabela {metadata.tableDate}
            </span>
          </div>
        </header>
        <main className="flex-1 max-w-5xl mx-auto px-4 py-6 w-full">
          {children}
        </main>
        <footer className="border-t border-gray-200 bg-white">
          <div className="max-w-5xl mx-auto px-4 py-3 text-center text-xs text-gray-400">
            Fonte: {metadata.sourceFile} · {metadata.totalProcedures} procedimentos
          </div>
        </footer>
      </body>
    </html>
  );
}
