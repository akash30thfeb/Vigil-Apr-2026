"use client";

import { Fragment } from "react";

/**
 * Renders basic markdown-style formatting:
 * - **bold** → <strong>
 * - Line breaks preserved via whitespace-pre-line on parent
 */
export function FormattedMessage({ text }: { text: string }) {
  // Split on **...**  patterns
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-white">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
