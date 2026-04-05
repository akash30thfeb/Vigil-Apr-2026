"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { smoothNavigate, smoothRefresh } from "@/lib/navigate";
import { ResponseChips } from "@/components/ResponseChips";
import { FormattedMessage } from "@/components/FormattedMessage";
import { VoiceButton } from "@/components/VoiceButton";
import { useVoiceMode } from "@/hooks/useVoiceMode";

type Message = { role: "user" | "assistant"; content: string };

export function ChatDrawer() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  const voice = useVoiceMode({
    onTranscript: (text) => send(text),
    onInterim: (text) => setInput(text),
  });

  // Auto-resize textarea when input changes (voice or keyboard)
  useEffect(() => {
    const t = textareaRef.current;
    if (t) {
      t.style.height = "auto";
      t.style.height = Math.min(t.scrollHeight, 80) + "px";
    }
  }, [input]);

  useEffect(() => {
    if (restoredRef.current) {
      // Restored from landing page — scroll instantly, no animation
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
      restoredRef.current = false;
    } else {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  // On mount: restore conversation from landing page if available
  const restoredRef = useRef(false);
  useEffect(() => {
    const saved = sessionStorage.getItem("vigil_chat");
    const shouldOpen = sessionStorage.getItem("vigil_chat_open");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Message[];
        setMessages(parsed);
        restoredRef.current = true;
        sessionStorage.removeItem("vigil_chat");
      } catch { /* ignore bad data */ }
    }
    if (shouldOpen === "true") {
      setOpen(true);
      sessionStorage.removeItem("vigil_chat_open");
    }
    // Restore voice mode if it was active on landing page
    const wasVoiceActive = sessionStorage.getItem("vigil_voice_active");
    if (wasVoiceActive === "true") {
      sessionStorage.removeItem("vigil_voice_active");
      // Small delay to let component mount fully before activating voice
      setTimeout(() => voice.toggleVoiceMode(), 300);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear unread count when opened
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  function addAssistantMessage(content: string) {
    setMessages((m) => [...m, { role: "assistant", content }]);
    if (!open) setUnread((n) => n + 1);
  }

  async function send(text: string) {
    if (!text.trim() || loading) return;

    // Cancel TTS if Vigil is speaking
    voice.stopSpeaking();

    // Terminal phrases — don't hit the API
    const terminal = text.toLowerCase().trim();
    if (terminal === "that's all for now" || terminal === "done" || terminal === "nothing else" || terminal === "no thanks") {
      setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "Great — I'm here whenever you need me!" }]);
      return;
    }

    const updated: Message[] = [...messages, { role: "user", content: text }];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updated }),
      });
      const data = await res.json();

      addAssistantMessage(data.message);
      voice.speak(data.message);

      if (data.item_logged || data.reminders_added) {
        const dept = data.department ?? "dashboard";
        const name = encodeURIComponent(data.item_name ?? "Item");
        const deptPath = `/dashboard/${dept}`;

        setTimeout(() => {
          if (data.reminders_added && pathname === deptPath) {
            smoothRefresh(router);
          } else if (pathname === deptPath || pathname === `${deptPath}?logged=${name}`) {
            smoothRefresh(router);
          } else {
            smoothNavigate(router, `${deptPath}?logged=${name}`);
          }
        }, 800);

        // Fallback nudge — only if agent didn't already ask a question
        setTimeout(() => {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last.content.includes("?")) return prev;
            return [...prev, { role: "assistant", content: "Anything else you'd like to track?" }];
          });
        }, 2500);
      }
    } catch {
      addAssistantMessage("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Drawer panel */}
      {open && (
        <div
          className="w-80 rounded-2xl border border-white/10 bg-[#111118] shadow-2xl flex flex-col overflow-hidden"
          style={{ height: "420px" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm font-medium text-white">Vigil</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMessages([])}
                className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                Clear
              </button>
              <button
                onClick={() => setOpen(false)}
                className="text-zinc-500 hover:text-white transition-colors text-xl leading-none pb-0.5"
              >
                ×
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-xs text-zinc-600 text-center mt-10">
                Tell me what you bought, signed, or hired.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i}>
                <div
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`rounded-xl px-3 py-2 text-xs leading-relaxed max-w-[85%] whitespace-pre-line ${
                      m.role === "user"
                        ? "bg-white/10 text-white"
                        : "bg-white/5 text-zinc-300 border border-white/5"
                    }`}
                  >
                    {m.role === "assistant" ? <FormattedMessage text={m.content} /> : m.content}
                  </div>
                </div>
                {m.role === "assistant" && i === messages.length - 1 && !loading && (
                  <div className="flex justify-start mt-1">
                    <ResponseChips
                      lastMessage={m.content}
                      onSelect={(text) => send(text)}
                      disabled={loading}
                    />
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-xl px-3 py-2 bg-white/5 border border-white/5">
                  <span className="flex gap-1">
                    <span className="w-1 h-1 rounded-full bg-zinc-500 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1 h-1 rounded-full bg-zinc-500 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1 h-1 rounded-full bg-zinc-500 animate-bounce [animation-delay:300ms]" />
                  </span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Voice timeout message */}
          {voice.timedOut && (
            <div className="px-3 pb-1 flex-shrink-0">
              <div className="flex items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5">
                <span className="text-[10px] text-amber-300">Voice paused — tap mic to resume</span>
              </div>
            </div>
          )}

          {/* Input */}
          <div className="px-3 py-3 border-t border-white/5 flex-shrink-0">
            <div className={`flex gap-2 rounded-xl border ${voice.voiceActive ? "border-emerald-500/30" : "border-white/10"} bg-white/5 px-3 py-2 items-end transition-colors`}>
              <VoiceButton
                voiceActive={voice.voiceActive}
                listening={voice.listening}
                timedOut={voice.timedOut}
                isSpeaking={voice.isSpeaking}
                supported={voice.supported}
                toggleVoiceMode={voice.toggleVoiceMode}
                disabled={loading}
                size="sm"
              />
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                placeholder="Log, update, or ask about a record..."
                className="flex-1 bg-transparent text-white placeholder-zinc-600 text-xs outline-none resize-none"
                rows={1}
                autoFocus
              />
              <button
                onClick={() => send(input)}
                disabled={loading || !input.trim()}
                className="text-white font-medium disabled:opacity-30 transition-opacity text-sm pb-0.5"
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toggle button with unread badge */}
      <div className="relative">
        {unread > 0 && !open && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center z-10 shadow">
            {unread}
          </span>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:bg-zinc-100 transition-colors"
          title="Open Vigil chat"
        >
          {open ? (
            <span className="text-xl leading-none">×</span>
          ) : (
            <span className="text-xl">💬</span>
          )}
        </button>
      </div>
    </div>
  );
}
