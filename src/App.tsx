import { useCallback, useEffect, useState } from "react";
import {
  Send,
  Bot,
  QrCode,
  Code2,
  CheckCircle2,
  WifiOff,
  Loader2,
  MessagesSquare,
  Search,
} from "lucide-react";
import type {
  AutoReplyLog,
  BlastState,
  BusinessProfile,
  ChatMessage,
  WaState,
} from "./types";
import { BusinessAIForm } from "./components/BusinessAIForm";
import { BlastComposer } from "./components/BlastComposer";
import { AutoResponderPanel } from "./components/AutoResponderPanel";
import { WhatsAppPairingPanel } from "./components/WhatsAppPairingPanel";
import { CodespacesExportPanel } from "./components/CodespacesExportPanel";
import { GeminiChatbotPanel } from "./components/GeminiChatbotPanel";
import { LeadFinderPanel } from "./components/LeadFinderPanel";

type ActiveTab = "blaster" | "leads" | "chatbot" | "autoresponder" | "pairing" | "codespaces";

const NAV_ITEMS: Array<{
  id: ActiveTab;
  label: string;
  shortLabel: string;
  icon: typeof Send;
}> = [
  { id: "blaster", label: "Campaign Blaster", shortLabel: "Blaster", icon: Send },
  { id: "leads", label: "Cari Leads & Cek WA", shortLabel: "Leads", icon: Search },
  { id: "chatbot", label: "AI Chatbot Gemini", shortLabel: "Chatbot", icon: MessagesSquare },
  { id: "autoresponder", label: "Auto-Responder AI", shortLabel: "Balas", icon: Bot },
  { id: "pairing", label: "Pairing WhatsApp", shortLabel: "Pairing", icon: QrCode },
  { id: "codespaces", label: "Ekspor Codespaces", shortLabel: "Ekspor", icon: Code2 },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("blaster");

  const [waState, setWaState] = useState<WaState>({
    status: "disconnected",
    qrDataUrl: null,
    user: null,
    lastError: null,
    qrUpdatedAt: null,
  });

  const [profile, setProfile] = useState<BusinessProfile>({
    businessName: "Kopi Senja Nusantara",
    productType: "Kopi Arabika & Minuman Kemasan 1 Liter",
    description:
      "Biji kopi pilihan single origin dari petani lokal, dipanggang fresh tiap minggu, tersedia kopi susu gula aren & cold brew siap kirim.",
    targetAudience: "Pekerja kantoran, mahasiswa, dan pemilik kafe rumahan",
    promoType: "Diskon 20% pembelian pertama + Gratis Ongkir area Jabodetabek",
    tone: "Ramah & Santai",
    customPrompt: "",
    faqNotes:
      "Buka setiap hari 08.00 - 21.00 WIB. Pengiriman instan GoSend/GrabExpress atau ekspedisi reguler. Minimal order 2 botol untuk gratis ongkir.",
  });

  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [autoReplyLogs, setAutoReplyLogs] = useState<AutoReplyLog[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const [numbersText, setNumbersText] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [blastState, setBlastState] = useState<BlastState>({
    running: false,
    total: 0,
    sent: 0,
    failed: 0,
    currentTarget: null,
    delayCountdownSec: 0,
    items: [],
    startedAt: null,
    finishedAt: null,
  });

  const fetchInitialData = useCallback(async () => {
    try {
      const [waRes, arRes, blastRes] = await Promise.all([
        fetch("/api/wa/status"),
        fetch("/api/autoresponder/config"),
        fetch("/api/blast/status"),
      ]);
      if (waRes.ok) setWaState(await waRes.json());
      if (arRes.ok) {
        const arData = await arRes.json();
        if (arData.config) {
          setAutoReplyEnabled(Boolean(arData.config.enabled));
          setProfile((prev) => ({
            ...prev,
            businessName: arData.config.businessName || prev.businessName,
            productType: arData.config.productType || prev.productType,
            description: arData.config.description || prev.description,
            targetAudience: arData.config.targetAudience || prev.targetAudience,
            promoType: arData.config.promoType || prev.promoType,
            tone: arData.config.tone || prev.tone,
            faqNotes: arData.config.faqNotes || prev.faqNotes,
          }));
        }
        if (Array.isArray(arData.logs)) {
          setAutoReplyLogs(arData.logs);
        }
      }
      if (blastRes.ok) setBlastState(await blastRes.json());
    } catch {
      // Initial poll fallback handled by SSE / periodic refresh
    }
  }, []);

  const refreshBlast = useCallback(async () => {
    try {
      const res = await fetch("/api/blast/status");
      if (res.ok) setBlastState(await res.json());
    } catch {
      // Ignored
    }
  }, []);

  useEffect(() => {
    fetchInitialData();

    const eventSource = new EventSource("/api/events");
    eventSource.addEventListener("wa_status", (e) => {
      try {
        setWaState(JSON.parse(e.data));
      } catch {
        // Ignored
      }
    });
    eventSource.addEventListener("blast_progress", (e) => {
      try {
        setBlastState(JSON.parse(e.data));
      } catch {
        // Ignored
      }
    });
    eventSource.addEventListener("auto_reply", (e) => {
      try {
        const logEntry = JSON.parse(e.data) as AutoReplyLog;
        setAutoReplyLogs((prev) => {
          if (prev.some((item) => item.id === logEntry.id)) return prev;
          return [logEntry, ...prev].slice(0, 50);
        });
      } catch {
        // Ignored
      }
    });

    return () => {
      eventSource.close();
    };
  }, [fetchInitialData]);

  const handleConnectWA = async () => {
    setActiveTab("pairing");
    await fetch("/api/wa/connect", { method: "POST" });
  };

  const handleLogoutWA = async () => {
    await fetch("/api/wa/logout", { method: "POST" });
  };

  const syncAutoResponderConfig = async (
    nextEnabled: boolean,
    nextProfile: BusinessProfile
  ) => {
    await fetch("/api/autoresponder/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: nextEnabled,
        businessName: nextProfile.businessName,
        productType: nextProfile.productType,
        description: nextProfile.description,
        targetAudience: nextProfile.targetAudience,
        promoType: nextProfile.promoType,
        tone: nextProfile.tone,
        faqNotes: nextProfile.faqNotes,
      }),
    });
  };

  const handleToggleAutoReply = async (next: boolean) => {
    setAutoReplyEnabled(next);
    await syncAutoResponderConfig(next, profile);
  };

  const handleSaveAutoResponderConfig = async () => {
    await syncAutoResponderConfig(autoReplyEnabled, profile);
  };

  const activeNav = NAV_ITEMS.find((n) => n.id === activeTab)!;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:shrink-0 bg-white border-r border-slate-200 sticky top-0 h-screen">
        <div className="h-16 px-5 flex items-center border-b border-slate-200">
          <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            KirimAI
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 text-xs text-slate-500 space-y-1">
          <div className="font-medium text-slate-700">Status Perangkat</div>
          <div className="flex items-center gap-1.5">
            {waState.status === "connected" ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="text-emerald-700 font-medium truncate font-mono">
                  {waState.user?.id?.split(":")[0] || "Terhubung"}
                </span>
              </>
            ) : waState.status === "qr_ready" ? (
              <>
                <QrCode className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="text-amber-700 font-medium">Siap Scan QR</span>
              </>
            ) : waState.status === "connecting" ? (
              <>
                <Loader2 className="w-3.5 h-3.5 text-slate-500 animate-spin shrink-0" />
                <span>Menghubungkan...</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Belum Terhubung</span>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-0">
        {/* Top Bar Contract: 3 clean zones */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-8 sticky top-0 z-20">
          <div className="flex items-center gap-2 min-w-0">
            <span className="lg:hidden text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
              KirimAI
            </span>
            <span className="hidden lg:inline text-sm text-slate-500 whitespace-nowrap">
              Workspace
            </span>
            <span className="hidden lg:inline text-slate-300">/</span>
            <h1 className="hidden lg:inline text-sm font-semibold text-slate-900 whitespace-nowrap truncate">
              {activeNav.label}
            </h1>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap">
            <span>
              Auto-Reply: {autoReplyEnabled ? "Aktif" : "Nonaktif"}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {waState.status === "connected"
                ? `WA ${waState.user?.id?.split(":")[0] || "Aktif"}`
                : waState.status === "qr_ready"
                ? "QR Siap Dipindai"
                : "WA Terputus"}
            </span>
          </div>

          <div className="shrink-0">
            <button
              type="button"
              onClick={
                waState.status === "connected"
                  ? () => setActiveTab("pairing")
                  : handleConnectWA
              }
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {waState.status === "connected"
                ? "Kelola Perangkat WA"
                : waState.status === "qr_ready"
                ? "Lihat QR Pairing"
                : "Hubungkan WhatsApp"}
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {activeTab === "blaster" && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              <div className="xl:col-span-5">
                <BusinessAIForm
                  profile={profile}
                  onChange={setProfile}
                  onApplyMessage={(msg) => setMessageTemplate(msg)}
                />
              </div>
              <div className="xl:col-span-7">
                <BlastComposer
                  numbersText={numbersText}
                  onNumbersChange={setNumbersText}
                  messageTemplate={messageTemplate}
                  onMessageChange={setMessageTemplate}
                  blastState={blastState}
                  waState={waState}
                  onGoToPairing={() => setActiveTab("pairing")}
                  onRefreshBlast={refreshBlast}
                />
              </div>
            </div>
          )}

          {activeTab === "leads" && (
            <LeadFinderPanel
              profile={profile}
              waState={waState}
              onGoToPairing={() => setActiveTab("pairing")}
              onAddNumbersToBlast={(newLines) => {
                const existing = numbersText
                  .split(/\r?\n/)
                  .map((s) => s.trim())
                  .filter(Boolean);
                const merged = Array.from(new Set([...existing, ...newLines]));
                setNumbersText(merged.join("\n"));
                setActiveTab("blaster");
              }}
            />
          )}

          {activeTab === "chatbot" && (
            <GeminiChatbotPanel
              profile={profile}
              messages={chatMessages}
              onChangeMessages={setChatMessages}
              onUseAsBlast={(text) => {
                setMessageTemplate(text);
                setActiveTab("blaster");
              }}
            />
          )}

          {activeTab === "autoresponder" && (
            <AutoResponderPanel
              enabled={autoReplyEnabled}
              onToggleEnabled={handleToggleAutoReply}
              profile={profile}
              onChangeProfile={setProfile}
              onSaveConfig={handleSaveAutoResponderConfig}
              logs={autoReplyLogs}
              onLogAdded={(log) =>
                setAutoReplyLogs((prev) => [log, ...prev].slice(0, 50))
              }
            />
          )}

          {activeTab === "pairing" && (
            <WhatsAppPairingPanel
              waState={waState}
              onConnect={handleConnectWA}
              onLogout={handleLogoutWA}
            />
          )}

          {activeTab === "codespaces" && <CodespacesExportPanel />}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar (under 15% sticky height, >= 44px touch targets) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 z-30 grid grid-cols-6">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`min-h-[52px] flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors cursor-pointer ${
                isActive ? "text-emerald-700" : "text-slate-500"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="whitespace-nowrap">{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
