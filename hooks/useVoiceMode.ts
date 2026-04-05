"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ─── Speech Recognition types ────────────────────────────────────────────────

type SpeechRecognitionEvent = {
  results: SpeechRecognitionResultList;
  resultIndex: number;
};

type SpeechRecognitionResultList = {
  [index: number]: SpeechRecognitionResult;
  length: number;
};

type SpeechRecognitionResult = {
  [index: number]: { transcript: string };
  isFinal: boolean;
  length: number;
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onaudiostart: (() => void) | null;
};

function getSR(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const WAKE_PHRASES = ["hi vigil", "ok vigil", "hey vigil", "okay vigil"];
const SLEEP_PHRASES = ["stop voice mode", "pause listening", "stop listening"];

const DEFAULT_SILENCE_MS = 3000;
const DEFAULT_INACTIVITY_MS = 60_000;
const RESTART_COOLDOWN_MS = 800;
const MAX_RAPID_RESTARTS = 3;

// ─── TTS helpers ─────────────────────────────────────────────────────────────

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  const preferred = [
    "Google UK English Female",
    "Google UK English Male",
    "Microsoft Libby Online (Natural)",
    "Microsoft Sonia Online (Natural)",
    "Google US English",
  ];
  for (const name of preferred) {
    const v = voices.find((v) => v.name === name);
    if (v) return v;
  }
  return voices.find((v) => v.lang.startsWith("en")) ?? voices[0] ?? null;
}

// Prime Chrome's audio pipeline with a short AudioContext beep (inaudible)
// This forces the audio output path open so the first SpeechSynthesis utterance
// doesn't lose its opening words.
let audioPrimed = false;
function primeAudio() {
  if (audioPrimed) return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0; // silent
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
    setTimeout(() => ctx.close(), 100);
    audioPrimed = true;
  } catch { /* ignore */ }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

type UseVoiceModeOptions = {
  onTranscript: (text: string) => void;
  onInterim?: (text: string) => void;
  silenceTimeout?: number;
  inactivityTimeout?: number;
};

export function useVoiceMode({
  onTranscript,
  onInterim,
  silenceTimeout = DEFAULT_SILENCE_MS,
  inactivityTimeout = DEFAULT_INACTIVITY_MS,
}: UseVoiceModeOptions) {
  const [supported, setSupported] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [timedOut, setTimedOut] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptBuf = useRef("");
  const voiceActiveRef = useRef(false);
  const speakingRef = useRef(false);

  // Stable refs for callbacks
  const onTranscriptRef = useRef(onTranscript);
  const onInterimRef = useRef(onInterim);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);
  useEffect(() => { onInterimRef.current = onInterim; }, [onInterim]);

  // Restart loop guard
  const lastRestartTime = useRef(0);
  const rapidRestartCount = useRef(0);
  const audioStartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { voiceActiveRef.current = voiceActive; }, [voiceActive]);

  // Detect support + preload voices
  useEffect(() => {
    setSupported(!!getSR());
    if (typeof window !== "undefined" && window.speechSynthesis) {
      speechSynthesis.getVoices();
      speechSynthesis.addEventListener("voiceschanged", () => speechSynthesis.getVoices());
    }
  }, []);

  // ── Timers ──────────────────────────────────────────────────────────────

  const clearSilence = useCallback(() => {
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
  }, []);

  const clearInactivity = useCallback(() => {
    if (inactivityTimer.current) {
      clearTimeout(inactivityTimer.current);
      inactivityTimer.current = null;
    }
  }, []);

  const resetInactivity = useCallback(() => {
    clearInactivity();
    inactivityTimer.current = setTimeout(() => {
      setTimedOut(true);
      setVoiceActive(false);
      voiceActiveRef.current = false;
      recRef.current?.stop();
    }, inactivityTimeout);
  }, [clearInactivity, inactivityTimeout]);

  // ── Recognition lifecycle ───────────────────────────────────────────────

  const startRecognition = useCallback(() => {
    const SR = getSR();
    if (!SR) return;

    // Rapid restart guard
    const now = Date.now();
    if (now - lastRestartTime.current < RESTART_COOLDOWN_MS) {
      rapidRestartCount.current++;
      if (rapidRestartCount.current >= MAX_RAPID_RESTARTS) {
        // Stop retrying — mic is unavailable. User must tap mic to retry.
        setListening(false);
        return;
      }
    } else {
      rapidRestartCount.current = 0;
    }
    lastRestartTime.current = now;

    if (recRef.current) {
      try { recRef.current.abort(); } catch { /* ignore */ }
    }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-GB";
    recRef.current = rec;
    transcriptBuf.current = "";

    rec.onaudiostart = () => {
      setListening(true);
      rapidRestartCount.current = 0;
      if (audioStartTimer.current) {
        clearTimeout(audioStartTimer.current);
        audioStartTimer.current = null;
      }
    };

    rec.onresult = (e: SpeechRecognitionEvent) => {
      resetInactivity();
      clearSilence();

      let final = "";
      let interimText = "";

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          final += t;
        } else {
          interimText += t;
        }
      }

      if (final) transcriptBuf.current += final;

      const display = (transcriptBuf.current + interimText).trim();
      setInterim(display);
      onInterimRef.current?.(display);

      silenceTimer.current = setTimeout(() => {
        const text = transcriptBuf.current.trim();
        if (!text) return;

        const lower = text.toLowerCase();
        for (const phrase of SLEEP_PHRASES) {
          if (lower === phrase || lower.endsWith(phrase)) {
            setVoiceActive(false);
            voiceActiveRef.current = false;
            rec.stop();
            setInterim("");
            onInterimRef.current?.("");
            transcriptBuf.current = "";
            return;
          }
        }

        let cleaned = text;
        const lowerCleaned = cleaned.toLowerCase();
        for (const phrase of WAKE_PHRASES) {
          if (lowerCleaned.startsWith(phrase)) {
            cleaned = cleaned.slice(phrase.length).replace(/^[,\s]+/, "");
            break;
          }
        }

        if (cleaned.trim()) {
          onTranscriptRef.current(cleaned.trim());
        }

        transcriptBuf.current = "";
        setInterim("");
        onInterimRef.current?.("");
        rec.stop();
      }, silenceTimeout);
    };

    rec.onend = () => {
      setListening(false);
      clearSilence();

      if (voiceActiveRef.current && !speakingRef.current) {
        setTimeout(() => {
          if (voiceActiveRef.current && !speakingRef.current) {
            startRecognition();
          }
        }, RESTART_COOLDOWN_MS);
      }
    };

    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      setListening(false);
    };

    try {
      rec.start();
      resetInactivity();
      // If audio doesn't start within 2s, stop trying (mic unavailable)
      audioStartTimer.current = setTimeout(() => {
        audioStartTimer.current = null;
        if (!speakingRef.current) {
          setListening(false);
          try { rec.abort(); } catch { /* ignore */ }
        }
      }, 2000);
    } catch { /* ignore */ }
  }, [silenceTimeout, resetInactivity, clearSilence]);

  // ── TTS ─────────────────────────────────────────────────────────────────

  const speak = useCallback(
    (text: string) => {
      if (!voiceActiveRef.current) return;
      if (!window.speechSynthesis) return;

      // Prime audio pipeline on first use
      primeAudio();

      // Stop mic while speaking — prevents picking up own voice
      speakingRef.current = true;
      setIsSpeaking(true);
      try { recRef.current?.stop(); } catch { /* ignore */ }

      speechSynthesis.cancel();

      // Clean text for speech
      const clean = text.replace(/\*\*/g, "").replace(/[•✅]/g, "").trim();

      const selectedVoice = pickVoice();

      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = 1.25;
      utterance.pitch = 1.0;
      if (selectedVoice) utterance.voice = selectedVoice;

      utterance.onend = () => {
        speakingRef.current = false;
        setIsSpeaking(false);
        if (voiceActiveRef.current) {
          setTimeout(() => startRecognition(), 400);
        }
      };

      utterance.onerror = () => {
        speakingRef.current = false;
        setIsSpeaking(false);
        if (voiceActiveRef.current) {
          setTimeout(() => startRecognition(), 400);
        }
      };

      // Short delay lets cancel() fully clear, then speak
      setTimeout(() => {
        if (!voiceActiveRef.current) return;
        speechSynthesis.speak(utterance);
      }, 50);
    },
    [startRecognition]
  );

  // Skip TTS and resume listening immediately
  const stopSpeaking = useCallback(() => {
    speechSynthesis.cancel();
    speakingRef.current = false;
    setIsSpeaking(false);
    // Resume mic after skipping
    if (voiceActiveRef.current) {
      setTimeout(() => startRecognition(), 200);
    }
  }, [startRecognition]);

  // ── Toggle ──────────────────────────────────────────────────────────────

  const toggleVoiceMode = useCallback(() => {
    if (voiceActive) {
      // If currently speaking, skip TTS and resume mic
      if (speakingRef.current) {
        stopSpeaking();
        return;
      }
      // Otherwise deactivate entirely
      setVoiceActive(false);
      voiceActiveRef.current = false;
      recRef.current?.stop();
      clearSilence();
      clearInactivity();
      setInterim("");
      setTimedOut(false);
      speechSynthesis.cancel();
      speakingRef.current = false;
      setIsSpeaking(false);
      rapidRestartCount.current = 0;
    } else {
      setVoiceActive(true);
      voiceActiveRef.current = true;
      setTimedOut(false);
      rapidRestartCount.current = 0;
      primeAudio();
      startRecognition();
    }
  }, [voiceActive, startRecognition, stopSpeaking, clearSilence, clearInactivity]);

  // ── Cleanup ─────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      clearSilence();
      clearInactivity();
      if (audioStartTimer.current) clearTimeout(audioStartTimer.current);
      try { recRef.current?.abort(); } catch { /* ignore */ }
      // Don't cancel speechSynthesis here — let TTS finish during navigation.
      // TTS is cancelled explicitly via stopSpeaking() or toggleVoiceMode().
    };
  }, [clearSilence, clearInactivity]);

  return {
    supported,
    voiceActive,
    listening,
    interim,
    timedOut,
    isSpeaking,
    isSpeakingRef: speakingRef,
    toggleVoiceMode,
    speak,
    stopSpeaking,
  };
}
