"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { UserInfo } from "@/components/UserInfo";
import { ResponseChips } from "@/components/ResponseChips";
import { FormattedMessage } from "@/components/FormattedMessage";
import { VoiceButton } from "@/components/VoiceButton";
import { useVoiceMode } from "@/hooks/useVoiceMode";
import { smoothNavigate } from "@/lib/navigate";

// ============================================================
// Dynamic suggestion chip generator
// ============================================================

const PEOPLE = [
  { name: "Priya Sharma", possessive: "Her" },
  { name: "James Okafor", possessive: "His" },
  { name: "Aisha Patel", possessive: "Her" },
  { name: "Marcus Chen", possessive: "His" },
  { name: "Sofia Rodriguez", possessive: "Her" },
  { name: "Daniel Kim", possessive: "His" },
  { name: "Fatima Al-Rashid", possessive: "Her" },
  { name: "Tom Bradley", possessive: "His" },
  { name: "Neha Gupta", possessive: "Her" },
  { name: "Liam O'Brien", possessive: "His" },
  { name: "Maya Johnson", possessive: "Her" },
  { name: "Ravi Krishnan", possessive: "His" },
];

const DEPT_ROLES = [
  { dept: "Engineering", roles: ["Software Engineer", "DevOps Engineer", "Tech Lead"] },
  { dept: "Data Science", roles: ["Data Scientist", "ML Engineer", "Research Scientist"] },
  { dept: "Data Analytics", roles: ["Data Analyst", "BI Analyst", "Analytics Manager"] },
  { dept: "IT", roles: ["Systems Administrator", "IT Manager", "Security Analyst"] },
  { dept: "People Functions", roles: ["HR Manager", "Recruiter", "People Partner"] },
  { dept: "Sales", roles: ["Account Executive", "SDR", "Sales Manager"] },
];

const MANAGERS = ["Sarah Chen", "David Wilson", "Raj Patel", "Emma Thompson", "Carlos Mendez", "Nina Kozlova"];

const CONTRACT_ITEMS = [
  { name: "Datadog APM", vendor: "Datadog", value: 18000 },
  { name: "Jira Cloud", vendor: "Atlassian", value: 9600 },
  { name: "HubSpot CRM", vendor: "HubSpot", value: 24000 },
  { name: "Zendesk Suite", vendor: "Zendesk", value: 15000 },
  { name: "Snowflake Data Cloud", vendor: "Snowflake", value: 36000 },
  { name: "GitHub Enterprise", vendor: "GitHub", value: 12000 },
  { name: "PagerDuty", vendor: "PagerDuty", value: 8400 },
  { name: "DocuSign Business", vendor: "DocuSign", value: 7200 },
];

const SUBSCRIPTION_ITEMS = [
  { name: "Linear", vendor: "Linear", value: 400 },
  { name: "Vercel Pro", vendor: "Vercel", value: 800 },
  { name: "1Password Business", vendor: "1Password", value: 600 },
  { name: "Loom Business", vendor: "Loom", value: 500 },
  { name: "Miro Team", vendor: "Miro", value: 700 },
  { name: "Grammarly Business", vendor: "Grammarly", value: 450 },
];

const ASSET_ITEMS = [
  { name: "MacBook Pro 16-inch", vendor: "Apple", price: 2499, warranty: 12 },
  { name: "ThinkPad X1 Carbon", vendor: "Lenovo", price: 1899, warranty: 36 },
  { name: "Dell XPS 15", vendor: "Dell", price: 1750, warranty: 24 },
  { name: "iPhone 15 Pro", vendor: "Apple", price: 1199, warranty: 12 },
  { name: "Dell UltraSharp 27\" Monitor", vendor: "Dell", price: 650, warranty: 36 },
  { name: "Samsung Galaxy S24", vendor: "Samsung", price: 899, warranty: 24 },
];

const SIGNATORIES = ["David Wilson", "Sarah Chen", "Priya Kapoor", "James Morgan", "Lisa Park"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function nextMonday(): Date {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return d;
}

function futureDate(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d;
}

function pastDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function generateChips(): string[] {
  const usedNames = new Set<string>();

  function uniquePerson() {
    const available = PEOPLE.filter((p) => !usedNames.has(p.name));
    const person = pick(available.length ? available : PEOPLE);
    usedNames.add(person.name);
    return person;
  }

  function uniqueManager() {
    const available = MANAGERS.filter((m) => !usedNames.has(m));
    const mgr = pick(available.length ? available : MANAGERS);
    usedNames.add(mgr);
    return mgr;
  }

  // 1. New employee — full-time joiner
  const emp1 = (() => {
    const p = uniquePerson();
    const dr = pick(DEPT_ROLES);
    const role = pick(dr.roles);
    const mgr = uniqueManager();
    return `New hire starting ${fmtDate(nextMonday())} — ${p.name}, joining ${dr.dept} as a ${role}. Full-time, reports to ${mgr}.`;
  })();

  // 2. New employee — intern with probation
  const emp2 = (() => {
    const p = uniquePerson();
    const dr = pick(DEPT_ROLES);
    const role = pick(dr.roles);
    const mgr = uniqueManager();
    return `${p.name} joined as ${role} in ${dr.dept} on ${fmtDate(pastDate(5))}. ${p.possessive} manager is ${mgr}. Intern, 3-month probation.`;
  })();

  // 3. Contract
  const con1 = (() => {
    const c = pick(CONTRACT_ITEMS);
    const sig = pick(SIGNATORIES);
    return `Log the ${c.name} contract with ${c.vendor} — £${c.value.toLocaleString()}/year, billed annually. Renews ${fmtDate(futureDate(12))}. 30-day notice, signed by ${sig}.`;
  })();

  // 4. Subscription
  const sub1 = (() => {
    const s = pick(SUBSCRIPTION_ITEMS);
    return `We started using ${s.name} — £${s.value}/month, billed monthly. Annual renewal on ${fmtDate(futureDate(6))}.`;
  })();

  // 5. Asset
  const asset1 = (() => {
    const a = pick(ASSET_ITEMS);
    const p = uniquePerson();
    return `Just bought a ${a.name} from ${a.vendor} for £${a.price.toLocaleString()}. Purchased ${fmtDate(pastDate(2))}, assigned to ${p.name}, ${a.warranty}-month warranty.`;
  })();

  // 6. Another asset
  const asset2 = (() => {
    const a = pick(ASSET_ITEMS);
    const p = uniquePerson();
    return `New ${a.name} from ${a.vendor}, £${a.price.toLocaleString()}. Bought ${fmtDate(pastDate(1))} for ${p.name}. ${a.warranty} months warranty.`;
  })();

  return [emp1, emp2, con1, sub1, asset1, asset2].sort(() => Math.random() - 0.5);
}

type Message = { role: "user" | "assistant"; content: string };

export default function LandingPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();

  useEffect(() => {
    if (isLoaded && user && !user.unsafeMetadata?.onboarded) {
      router.replace("/onboarding");
    }
  }, [isLoaded, user, router]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [logged, setLogged] = useState<{ name: string; department: string } | null>(null);
  const [fading, setFading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [chips, setChips] = useState<ReturnType<typeof generateChips>>([]);
  useEffect(() => { setChips(generateChips()); }, []);

  const voice = useVoiceMode({
    onTranscript: (text) => send(text),
    onInterim: (text) => setInput(text),
  });

  // Auto-resize textarea when input changes (voice or keyboard)
  useEffect(() => {
    const t = textareaRef.current;
    if (t) {
      t.style.height = "auto";
      t.style.height = Math.min(t.scrollHeight, 96) + "px";
    }
  }, [input]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  async function send(text: string) {
    if (!text.trim()) return;

    // Cancel TTS if Vigil is speaking — user action takes priority
    voice.stopSpeaking();

    // Terminal phrases — don't hit the API
    const terminal = text.toLowerCase().trim();
    if (terminal === "that's all for now" || terminal === "done" || terminal === "nothing else" || terminal === "no thanks") {
      setStarted(true);
      setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "Great — I'm here whenever you need me!" }]);
      return;
    }

    setStarted(true);
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

      if (data.item_logged || data.reminders_added) {
        const newMessages: Message[] = [
          ...updated,
          { role: "assistant", content: data.message },
        ];
        setMessages(newMessages);
        voice.speak(data.message);

        // Persist conversation + voice state for drawer pickup
        sessionStorage.setItem("vigil_chat", JSON.stringify(newMessages));
        sessionStorage.setItem("vigil_chat_open", "true");
        if (voice.voiceActive) {
          sessionStorage.setItem("vigil_voice_active", "true");
        }

        // Show success banner, then navigate after TTS or timeout
        const dept = data.department ?? "dashboard";
        const itemName = data.item_name ?? "Item";
        setLogged({ name: itemName, department: dept });

        // Wait for TTS to finish (poll), then fade + navigate
        const doNavigate = () => {
          setFading(true);
          setTimeout(() => {
            const name = encodeURIComponent(itemName);
            smoothNavigate(router, `/dashboard/${dept}?logged=${name}`);
          }, 400);
        };

        // Poll for TTS completion using ref (not stale state), max 15s
        const startWait = Date.now();
        const waitForTTS = () => {
          if (!voice.isSpeakingRef.current || Date.now() - startWait > 15000) {
            setTimeout(doNavigate, 800);
          } else {
            setTimeout(waitForTTS, 300);
          }
        };
        // Start checking after the banner shows briefly
        setTimeout(waitForTTS, 1500);
      } else {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: data.message },
        ]);
        voice.speak(data.message);
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`bg-[#0a0a0f] flex flex-col ${started ? "h-screen overflow-hidden" : "min-h-screen"}`}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <button
          onClick={() => router.refresh()}
          className="text-white font-semibold tracking-tight hover:opacity-70 transition-opacity"
        >
          Vigil
        </button>
        <div className="flex items-center gap-4">
          {started && (
            <button
              onClick={() => {
                setMessages([]);
                setStarted(false);
                setInput("");
              }}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Reset
            </button>
          )}
          <button
            onClick={() => router.push("/dashboard")}
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Dashboard →
          </button>
          <UserInfo />
        </div>
      </header>

      {/* Main */}
      <main className={`flex-1 flex flex-col items-center px-4 max-w-2xl mx-auto w-full transition-opacity duration-300 overflow-hidden min-h-0 ${fading ? "opacity-0" : "opacity-100"} ${started ? "pt-6" : "justify-center"}`}>
        {!started && (
          <div className="text-center mb-10">
            <div className="w-3 h-3 rounded-full bg-emerald-400 mx-auto mb-6 animate-pulse" />
            <h1 className="text-4xl font-semibold text-white tracking-tight mb-3">
              Listening...
            </h1>
            <p className="text-zinc-500 text-lg">
              Tell me what you bought, signed, or hired. I&apos;ll handle the rest.
            </p>
          </div>
        )}

        {/* Chat container — appears once conversation starts */}
        {started && (
          <div className="w-full flex-1 flex flex-col rounded-2xl border border-white/8 bg-white/[0.02] overflow-hidden min-h-0 mb-4">
            {/* Chat header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm font-medium text-white">Vigil</span>
              </div>
              <button
                onClick={() => { setMessages([]); setStarted(false); setInput(""); }}
                className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                Clear
              </button>
            </div>

            {/* Messages area */}
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
              {messages.map((m, i) => (
                <div key={i}>
                  <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`rounded-2xl px-4 py-2.5 max-w-[85%] text-sm leading-relaxed whitespace-pre-line ${
                        m.role === "user"
                          ? "bg-white/10 text-white"
                          : "bg-zinc-800/60 text-zinc-200 border border-white/5"
                      }`}
                    >
                      {m.role === "assistant" ? <FormattedMessage text={m.content} /> : m.content}
                    </div>
                  </div>
                  {m.role === "assistant" && i === messages.length - 1 && !loading && (
                    <div className="flex justify-start mt-1.5">
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
                  <div className="rounded-2xl px-4 py-2.5 bg-zinc-800/60 border border-white/5">
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:300ms]" />
                    </span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Success banner */}
            {logged && (
              <div className="px-5 pb-2 flex-shrink-0">
                <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-sm text-emerald-300">
                      <strong>{logged.name}</strong> logged
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500">Redirecting...</span>
                </div>
              </div>
            )}

            {/* Voice mode timeout message */}
            {voice.timedOut && (
              <div className="px-5 pb-2 flex-shrink-0">
                <div className="flex items-center justify-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2">
                  <span className="text-xs text-amber-300">Voice mode paused — tap the mic to resume</span>
                </div>
              </div>
            )}

            {/* Input �� pinned at bottom */}
            <div className="px-4 py-3 border-t border-white/5 flex-shrink-0">
              <div className={`flex gap-2 rounded-xl border ${voice.voiceActive ? "border-emerald-500/30" : "border-white/10"} bg-white/5 p-2 items-end transition-colors`}>
                <VoiceButton
                  voiceActive={voice.voiceActive}
                  listening={voice.listening}
                  timedOut={voice.timedOut}
                  isSpeaking={voice.isSpeaking}
                  supported={voice.supported}
                  toggleVoiceMode={voice.toggleVoiceMode}
                  disabled={loading}
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
                  placeholder="Tell me what you bought, signed, or hired..."
                  className="flex-1 bg-transparent text-white placeholder-zinc-500 text-sm outline-none px-2 resize-none"
                  rows={1}
                  autoFocus
                />
                <button
                  onClick={() => send(input)}
                  disabled={loading || !input.trim()}
                  className="rounded-xl bg-white text-black text-sm font-medium px-4 py-2 disabled:opacity-30 transition-opacity"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pre-conversation input + chips */}
        {!started && (
          <div className="w-full">
            <div className={`flex gap-2 rounded-2xl border ${voice.voiceActive ? "border-emerald-500/30" : "border-white/10"} bg-white/5 p-2 items-end transition-colors`}>
              <VoiceButton
                voiceActive={voice.voiceActive}
                listening={voice.listening}
                timedOut={voice.timedOut}
                isSpeaking={voice.isSpeaking}
                supported={voice.supported}
                toggleVoiceMode={voice.toggleVoiceMode}
                disabled={loading}
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
                placeholder="Tell me what you bought, signed, or hired..."
                className="flex-1 bg-transparent text-white placeholder-zinc-500 text-sm outline-none px-2 resize-none"
                rows={1}
              />
              <button
                onClick={() => send(input)}
                disabled={loading || !input.trim()}
                className="rounded-xl bg-white text-black text-sm font-medium px-4 py-2 disabled:opacity-30 transition-opacity"
              >
                Send
              </button>
            </div>

            {/* Quick-action chips */}
            <div className="flex flex-wrap gap-2 mt-4 justify-center">
              {[
                { label: "Log a new hire", icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg> },
                { label: "Add a contract", icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
                { label: "Track an asset", icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> },
                { label: "Update a record", icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> },
              ].map(({ label, icon }) => (
                <button
                  key={label}
                  onClick={() => send(label)}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 border border-white/10 rounded-full px-3 py-1.5 hover:bg-white/5 hover:text-white transition-colors"
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>

            {/* Ready-to-paste suggestion chips */}
            <div className="flex flex-wrap gap-2 mt-2 justify-center">
              {chips.map((chip) => (
                <button
                  key={chip}
                  onClick={() => send(chip)}
                  className="text-xs text-zinc-400 border border-white/10 rounded-full px-3 py-1.5 hover:bg-white/5 hover:text-white transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
