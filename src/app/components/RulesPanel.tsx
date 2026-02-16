"use client";

import { useState } from "react";

interface RulesPanelProps {
  rules: string[];
}

export default function RulesPanel({ rules }: RulesPanelProps) {
  const [open, setOpen] = useState(false);

  if (rules.length === 0) return null;

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
      >
        <span className="font-medium text-sm text-amber-800">
          Regras Específicas ({rules.length})
        </span>
        <span className="text-amber-600 text-lg">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <ol className="list-decimal list-outside ml-4 space-y-2">
            {rules.map((rule, i) => (
              <li key={i} className="text-sm text-amber-900 leading-relaxed">
                {rule}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
