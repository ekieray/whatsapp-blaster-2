import { useEffect, useRef, useState } from "react";
import {
  Send,
  Globe,
  Zap,
  Trash2,
  Copy,
  Check,
  ArrowRight,
  ExternalLink,
  Loader2,
  Bot,
} from "lucide-react";
import type { BusinessProfile, ChatMessage } from "../types";

interface GeminiChatbotPanelProps {
  profile: BusinessProfile;
  messages: ChatMessage[];
  onChangeMessages: (next: ChatMessage[]) => void;
  onUseAsBlast: (text: string) => void;
}

const STARTER_PROMPTS = [
  "Carikan ide promo berdasarkan tren belanja & hari penting bulan ini di Indonesia.",
  "Buatkan alur follow-up WhatsApp 3 hari untuk calon pembeli yang belum merespons.",
  "Berikan 5 variasi kalimat pembuka (hook) WhatsApp agar pesan tidak dianggap spam.",
  "Analisis target audiens bisnis saya dan rekomendasikan jam kirim blast terbaik.",
];

export function GeminiChatbotPanel({
  profile,
  messages,
  onChangeMessages,
  onUseAsBlast,
}: GeminiChatbotPanelProps) {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"strategist" | "fast">("strategist");
  const [useSearchGrounding, setUseSearchGrounding] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const sendMessage = async (promptText?: string) => {
    const text = (promptText ?? input).trim();
    if (!text || loading) return;

    setError(null);
    if (!promptText) setInput("");

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      timestamp: new Date().toISOString(),
    };

    const nextHistory = [...messages, userMsg];
    onChangeMessages(nextHistory);
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextHistory.map((m) => ({ role: m.role, text: m.text })),
          mode,
          useSearchGrounding: mode === "strategist" ? useSearchGrounding : false,
          businessProfile: profile,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal mendapatkan balasan Gemini AI.");
      }

      const botMsg: ChatMessage = {
        id: `m-${Date.now()}`,
        role: "model",
        text: data.reply,
        timestamp: new Date().toISOString(),
        model: data.model,
        sources: data.sources || [],
      };
      onChangeMessages([...nextHistory, botMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan jaringan.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Ignored
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl flex flex-col h-[calc(100vh-11rem)] min-h-[540px]">
      {/* Header Controls */}
      <div className="p-4 sm:px-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Asisten Strategi Marketing Gemini AI
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Konteks aktif: {profile.businessName || "Bisnis Umum"} · Multi-turn dengan riwayat percakapan
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setMode("strategist")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                mode === "strategist"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Strategist + Search</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("fast")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                mode === "fast"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Respon Cepat</span>
            </button>
          </div>

          {mode === "strategist" && (
            <button
              type="button"
              onClick={() => setUseSearchGrounding((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                useSearchGrounding
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Google Search: {useSearchGrounding ? "Aktif" : "Mati"}</span>
            </button>
          )}

          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                onChangeMessages([]);
                setError(null);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-red-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Reset Chat</span>
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Chat Thread */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-slate-50/50"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto py-8 space-y-5">
            <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-semibold text-slate-900">
                Konsultasi Kampanye &amp; Riset Pasar Real-Time
              </h3>
              <p className="text-xs sm:text-sm text-slate-600">
                Tanyakan strategi promo, jadwal kirim ideal, tren konsumen terbaru lewat Google Search, atau minta revisi copywriting WhatsApp untuk bisnis{" "}
                <span className="font-semibold text-slate-800">
                  {profile.businessName || "Anda"}
                </span>
                .
              </p>
            </div>

            <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => sendMessage(prompt)}
                  className="p-3 bg-white border border-slate-200 hover:border-emerald-500 rounded-lg text-xs text-slate-700 hover:text-slate-900 transition-colors cursor-pointer"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[88%] sm:max-w-[78%] rounded-xl p-3.5 sm:p-4 space-y-2.5 ${
                  msg.role === "user"
                    ? "bg-slate-900 text-white"
                    : "bg-white border border-slate-200 text-slate-800"
                }`}
              >
                <div className="flex items-center justify-between gap-4 text-[11px] opacity-75">
                  <span className="font-medium">
                    {msg.role === "user" ? "Anda" : "Gemini AI Assistant"}
                  </span>
                  <span className="font-mono tabular-nums">
                    {new Date(msg.timestamp).toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                <div className="text-sm leading-relaxed whitespace-pre-line">
                  {msg.text}
                </div>

                {msg.sources && msg.sources.length > 0 && (
                  <div className="pt-2.5 border-t border-slate-100 space-y-1.5">
                    <div className="text-[11px] font-medium text-slate-500">
                      Referensi Google Search
                    </div>
                    <div className="flex flex-col gap-1">
                      {msg.sources.slice(0, 5).map((src) => (
                        <a
                          key={src.uri}
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-emerald-700 hover:underline truncate"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          <span className="truncate">{src.title}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {msg.role === "model" && (
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopy(msg.text, msg.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Disalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onUseAsBlast(msg.text)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors cursor-pointer"
                    >
                      <span>Pakai ke Editor Blast</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-2.5 text-xs text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
              <span>
                {mode === "strategist" && useSearchGrounding
                  ? "Mencari referensi Google Search & menyusun jawaban..."
                  : "Menyusun jawaban..."}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-3.5 sm:p-4 border-t border-slate-200 bg-white rounded-b-xl space-y-2">
        {error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {error}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex items-end gap-2.5"
        >
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Tulis pertanyaan strategi marketing, riset tren, atau minta buatkan pesan WA... (Enter untuk kirim)"
            className="flex-1 px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white resize-none"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="h-[46px] px-4 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Kirim</span>
          </button>
        </form>
      </div>
    </div>
  );
}
