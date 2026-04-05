"use client";

import React from "react";

type Props = {
  voiceActive: boolean;
  listening: boolean;
  timedOut: boolean;
  isSpeaking: boolean;
  supported: boolean;
  toggleVoiceMode: () => void;
  disabled?: boolean;
  size?: "sm" | "md";
};

export function VoiceButton({
  voiceActive,
  listening,
  timedOut,
  isSpeaking,
  supported,
  toggleVoiceMode,
  disabled,
  size = "md",
}: Props) {
  if (!supported) return null;

  const sizeClasses = size === "sm" ? "w-7 h-7" : "w-9 h-9";

  // Determine visual state
  let colorClasses: string;
  let title: string;

  if (!voiceActive) {
    colorClasses = "text-zinc-500 hover:text-white hover:bg-white/10";
    title = "Start voice mode";
  } else if (timedOut) {
    colorClasses = "text-amber-400 bg-amber-500/15";
    title = "Voice paused — tap to resume";
  } else if (isSpeaking) {
    colorClasses = "text-emerald-400 bg-emerald-500/15 hover:text-white hover:bg-white/15";
    title = "Tap to skip";
  } else if (listening) {
    colorClasses = "text-emerald-400 bg-emerald-500/15 animate-pulse";
    title = "Listening... (tap to stop)";
  } else {
    // Active but between utterances
    colorClasses = "text-emerald-400 bg-emerald-500/10";
    title = "Voice mode active (tap to stop)";
  }

  // Pick icon
  let icon: React.ReactNode;

  if (isSpeaking) {
    // Sound wave icon
    icon = (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <line x1="2" y1="6" x2="2" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="5" y1="4" x2="5" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="11" y1="4" x2="11" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="14" y1="6" x2="14" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  } else {
    // Mic icon
    icon = (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="6" y="1" width="4" height="9" rx="2" fill="currentColor" />
        <path d="M4 7a4 4 0 0 0 8 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="8" y1="12" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleVoiceMode}
      disabled={disabled}
      title={title}
      className={`${sizeClasses} flex items-center justify-center rounded-lg transition-all disabled:opacity-30 ${colorClasses}`}
    >
      {icon}
    </button>
  );
}
