"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VersionInfo {
  date: string;
  label: string;
  sourceFile: string;
  totalProcedures: number;
}

interface VersionsIndex {
  latest: string;
  versions: VersionInfo[];
}

export interface Procedure {
  code: string;
  designation: string;
  category: string;
  categorySlug: string;
  adseCharge: number;
  copayment: number;
  [key: string]: unknown;
}

export interface RuleGroup {
  category: string;
  slug: string;
  rules: string[];
}

export interface Metadata {
  sourceFile: string;
  tableDate: string;
  parsedAt: string;
  totalProcedures: number;
  categories: Array<{ name: string; slug: string; count: number }>;
}

interface VersionData {
  procedures: Procedure[];
  rules: RuleGroup[];
  metadata: Metadata;
}

interface TableVersionContextValue {
  currentVersion: string;
  versions: VersionInfo[];
  procedures: Procedure[];
  rules: RuleGroup[];
  metadata: Metadata | null;
  loading: boolean;
  setVersion: (date: string) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const TableVersionContext = createContext<TableVersionContextValue | null>(null);

export function useTableVersion(): TableVersionContextValue {
  const ctx = useContext(TableVersionContext);
  if (!ctx) {
    throw new Error("useTableVersion must be used within a TableVersionProvider");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

async function fetchVersionData(date: string): Promise<VersionData> {
  const [procedures, rules, metadata] = await Promise.all([
    fetch(`/data/${date}/procedures.json`).then((r) => r.json()),
    fetch(`/data/${date}/rules.json`).then((r) => r.json()),
    fetch(`/data/${date}/metadata.json`).then((r) => r.json()),
  ]);
  return { procedures, rules, metadata };
}

export function TableVersionProvider({ children }: { children: ReactNode }) {
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [currentVersion, setCurrentVersion] = useState<string>("");
  const [data, setData] = useState<VersionData>({
    procedures: [],
    rules: [],
    metadata: null as unknown as Metadata,
  });
  const [loading, setLoading] = useState(true);
  const cache = useRef<Map<string, VersionData>>(new Map());

  // Load versions index on mount
  useEffect(() => {
    fetch("/data/versions.json")
      .then((r) => r.json())
      .then(async (index: VersionsIndex) => {
        setVersions(index.versions);
        setCurrentVersion(index.latest);

        // Load latest version data
        const versionData = await fetchVersionData(index.latest);
        cache.current.set(index.latest, versionData);
        setData(versionData);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load versions index:", err);
        setLoading(false);
      });
  }, []);

  const setVersion = useCallback(
    async (date: string) => {
      if (date === currentVersion) return;

      const cached = cache.current.get(date);
      if (cached) {
        setCurrentVersion(date);
        setData(cached);
        return;
      }

      setLoading(true);
      try {
        const versionData = await fetchVersionData(date);
        cache.current.set(date, versionData);
        setCurrentVersion(date);
        setData(versionData);
      } catch (err) {
        console.error(`Failed to load version ${date}:`, err);
      } finally {
        setLoading(false);
      }
    },
    [currentVersion],
  );

  return (
    <TableVersionContext.Provider
      value={{
        currentVersion,
        versions,
        procedures: data.procedures,
        rules: data.rules,
        metadata: data.metadata,
        loading,
        setVersion,
      }}
    >
      {children}
    </TableVersionContext.Provider>
  );
}
