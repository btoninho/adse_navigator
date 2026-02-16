"use client";

import { type ReactNode } from "react";
import {
  TableVersionProvider,
  useTableVersion,
} from "../../lib/TableVersionContext";

function VersionSelect() {
  const { currentVersion, versions, loading, setVersion } = useTableVersion();

  if (versions.length === 0) return null;

  return (
    <select
      value={currentVersion}
      onChange={(e) => setVersion(e.target.value)}
      disabled={loading}
      className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded border-0
                 cursor-pointer hover:bg-gray-200 transition-colors
                 disabled:opacity-50"
    >
      {versions.map((v) => (
        <option key={v.date} value={v.date}>
          Tabela {v.label}
        </option>
      ))}
    </select>
  );
}

function Header() {
  const { loading } = useTableVersion();

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <a href="/" className="font-bold text-lg text-blue-700">
          ADSE Navegador
        </a>
        <div className="flex items-center gap-3">
          <a
            href="/verificar-fatura"
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            Verificar Fatura
          </a>
          <VersionSelect />
          {loading && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-r-transparent" />
          )}
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const { metadata } = useTableVersion();

  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="max-w-5xl mx-auto px-4 py-3 text-center text-xs text-gray-400">
        {metadata
          ? `Fonte: ${metadata.sourceFile} · ${metadata.totalProcedures} procedimentos`
          : "A carregar…"}
      </div>
    </footer>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <TableVersionProvider>
      <Header />
      <main className="flex-1 max-w-5xl mx-auto px-4 py-6 w-full">
        {children}
      </main>
      <Footer />
    </TableVersionProvider>
  );
}
