"use client";

import { getChips } from "@/lib/response-chips";

type ResponseChipsProps = {
  lastMessage: string;
  onSelect: (text: string) => void;
  disabled?: boolean;
};

export function ResponseChips({ lastMessage, onSelect, disabled }: ResponseChipsProps) {
  const chips = getChips(lastMessage);

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {chips.map((chip) => (
        <button
          key={chip}
          onClick={() => onSelect(chip)}
          disabled={disabled}
          className="text-xs text-zinc-400 border border-white/10 rounded-full px-2.5 py-1 hover:bg-white/5 hover:text-white transition-colors disabled:opacity-30"
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
