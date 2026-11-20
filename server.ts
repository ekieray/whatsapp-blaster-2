import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import pino from "pino";
import QRCode from "qrcode";
import qrcodeTerminal from "qrcode-terminal";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} from "@whiskeysockets/baileys";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const AUTH_DIR = path.join(__dirname, "auth_info_baileys");
const CODESPACES_DIR = path.join(__dirname, "codespaces-starter");

type WaStatus = "disconnected" | "connecting" | "qr_ready" | "connected";

interface WaState {
  status: WaStatus;
  qrDataUrl: string | null;
  user: { id: string; name: string } | null;
  lastError: string | null;
  qrUpdatedAt: string | null;
}

interface AutoResponderConfig {
  enabled: boolean;
  businessName: string;
  productType: string;
  description: string;
  targetAudience: string;
  promoType: string;
  tone: string;
  faqNotes: string;
}

interface AutoReplyLog {
  id: string;
  sender: string;
  senderName: string;
  incoming: string;
  reply: string;
  timestamp: string;
  source: "whatsapp" | "simulation";
}

interface BlastItem {
  number: string;
  name: string;
  status: "queued" | "sending" | "sent" | "failed";
  error: string | null;
  sentAt: string | null;
}

interface BlastState {
  running: boolean;
  total: number;
  sent: number;
  failed: number;
  currentTarget: string | null;
  delayCountdownSec: number;
  items: BlastItem[];
  startedAt: string | null;
  finishedAt: string | null;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// ==========================================
// 1. RUNTIME STATE & SSE BROADCASTER
// ==========================================
let waSock: ReturnType<typeof makeWASocket> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;

let waState: WaState = {
  status: "disconnected",
  qrDataUrl: null,
  user: null,
  lastError: null,
  qrUpdatedAt: null,
};

let autoResponderConfig: AutoResponderConfig = {
  enabled: false,
  businessName: "Kopi Senja Nusantara",
  productType: "Kopi Arabika & Minuman Kemasan 1 Liter",
  description:
    "Biji kopi pilihan single origin dari petani lokal, dipanggang fresh tiap minggu, tersedia kopi susu gula aren & cold brew siap kirim.",
  targetAudience: "Pekerja kantoran, mahasiswa, dan pemilik kafe rumahan",
  promoType: "Diskon 20% pembelian pertama + Gratis Ongkir area Jabodetabek",
  tone: "Ramah & Santai",
  faqNotes:
    "Buka setiap hari 08.00 - 21.00 WIB. Pengiriman instan GoSend/GrabExpress atau ekspedisi reguler. Minimal order 2 botol untuk gratis ongkir.",
};

const autoReplyLogs: AutoReplyLog[] = [];
const replyCooldown = new Map<string, number>();
const waContacts = new Map<string, { number: string; name: string }>();

function saveWaContact(jid?: string | null, name?: string | null) {
  if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast" || jid.endsWith("@lid")) {
    return;
  }
  const rawNum = jid.split("@")[0];
  const normalized = normalizePhoneNumber(rawNum);
  if (!normalized) return;
  const existing = waContacts.get(normalized);
  const cleanName = (name || "").trim();
  waContacts.set(normalized, {
    number: normalized,
    name: cleanName || existing?.name || "Kontak WhatsApp",
  });
}

let blastState: BlastState = {
  running: false,
  total: 0,
  sent: 0,
  failed: 0,
  currentTarget: null,
  delayCountdownSec: 0,
  items: [],
  startedAt: null,
  finishedAt: null,
};
let stopBlastRequested = false;

const sseClients = new Set<Response>();

function broadcastEvent(event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const randomDelay = (minMs: number, maxMs: number) =>
  Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;

function normalizePhoneNumber(raw: string): string | null {
  const digits = String(raw).replace(/\D/g, "");
  if (!digits || digits.length < 8) return null;
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("8")) return "62" + digits;
  return digits;
}

// ==========================================
// 2. GEMINI AI HELPERS (SERVER-SIDE)
// ==========================================
async function generateAutoReplyText(
  incomingText: string,
  senderName: string,
  overrideProfile?: Partial<AutoResponderConfig>
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY belum tersedia. Periksa konfigurasi API key di Settings > Secrets."
    );
  }

  const profile = { ...autoResponderConfig, ...overrideProfile };

  const systemInstruction = `Anda adalah Customer Service & Sales Assistant resmi untuk bisnis berikut:
- Nama Usaha: ${profile.businessName}
- Produk / Jasa: ${profile.productType}
- Deskripsi & Keunggulan: ${profile.description}
- Target Konsumen: ${profile.targetAudience}
- Promo Aktif: ${profile.promoType}
- Informasi Operasional / FAQ: ${profile.faqNotes}
- Gaya Bahasa: ${profile.tone}

Aturan Membalas Pesan WhatsApp:
1. Sapa pelanggan dengan ramah menggunakan nama "${senderName}" bila sesuai.
2. Jawab singkat, jelas, natural, dan membantu (maksimal 3-4 kalimat).
3. Selipkan info promo atau ajakan order secara halus jika relevan dengan pertanyaan pelanggan.
4. Gunakan format WhatsApp secukupnya (*tebal* untuk penekanan penting).
5. Jangan mengarang fakta di luar profil bisnis; jika informasi spesifik belum tersedia, arahkan pelanggan untuk konfirmasi lebih lanjut dengan sopan.`;

  const response = await ai.models.generateContent({
    model: "gemini-4-hydrogen",
    contents: `Pesan masuk dari pelanggan (${senderName}): "${incomingText}"`,
    config: { systemInstruction },
  });

  return (
    response.text?.trim() ||
    "Terima kasih sudah menghubungi kami. Ada informasi produk atau promo yang ingin ditanyakan?"
  );
}

// ==========================================
// 3. WHATSAPP BAILEYS MULTI-DEVICE ENGINE
// ==========================================
async function startWhatsApp() {
  if (waState.status === "connecting") return;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  try {
    waState = {
      ...waState,
      status: "connecting",
      lastError: null,
    };
    broadcastEvent("wa_status", waState);

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    waSock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: "silent" }),
      browser: Browsers.ubuntu("KirimAI"),
      printQRInTerminal: false,
      connectTimeoutMs: 30000,
    });

    waSock.ev.on("creds.update", saveCreds);

    waSock.ev.on("messaging-history.set", ({ contacts, chats }) => {
      for (const c of contacts || []) {
        saveWaContact(c.id, c.name || c.notify || c.verifiedName);
      }
      for (const ch of chats || []) {
        saveWaContact(ch.id, ch.name);
      }
    });

    waSock.ev.on("contacts.upsert", (contacts) => {
      for (const c of contacts) {
        saveWaContact(c.id, c.name || c.notify || c.verifiedName);
      }
    });

    waSock.ev.on("contacts.update", (updates) => {
      for (const c of updates) {
        saveWaContact(c.id, c.name || c.notify || c.verifiedName);
      }
    });

    waSock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        reconnectAttempts = 0;
        console.log("\n[WhatsApp] Scan QR Code berikut dengan aplikasi WhatsApp di HP:");
        qrcodeTerminal.generate(qr, { small: true });

        try {
          const qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 2 });
          waState = {
            status: "qr_ready",
            qrDataUrl,
            user: null,
            lastError: null,
            qrUpdatedAt: new Date().toISOString(),
          };
          broadcastEvent("wa_status", waState);
        } catch (qrErr) {
          console.error("[QR Encode Error]:", qrErr);
        }
      }

      if (connection === "open") {
        reconnectAttempts = 0;
        console.log("[WhatsApp] Terhubung sebagai:", waSock?.user?.id);
        waState = {
          status: "connected",
          qrDataUrl: null,
          user: {
            id: waSock?.user?.id || "",
            name: waSock?.user?.name || "Perangkat Tertaut",
          },
          lastError: null,
          qrUpdatedAt: null,
        };
        broadcastEvent("wa_status", waState);
      }

      if (connection === "close") {
        const statusCode = (
          lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
        )?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const errorMessage =
          lastDisconnect?.error?.message || "Koneksi WhatsApp terputus.";

        waState = {
          status: "disconnected",
          qrDataUrl: null,
          user: null,
          lastError: isLoggedOut
            ? "Sesi telah logout. Silakan hubungkan ulang dan scan QR baru."
            : errorMessage,
          qrUpdatedAt: null,
        };
        broadcastEvent("wa_status", waState);

        if (!isLoggedOut && reconnectAttempts < 4) {
          reconnectAttempts += 1;
          const delayMs = 4000 * reconnectAttempts;
          console.log(
            `[WhatsApp] Mencoba hubungkan ulang (${reconnectAttempts}/4) dalam ${delayMs / 1000}s...`
          );
          reconnectTimer = setTimeout(() => {
            startWhatsApp();
          }, delayMs);
        } else if (isLoggedOut && fs.existsSync(AUTH_DIR)) {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        }
      }
    });

    waSock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify" || !autoResponderConfig.enabled || !waSock) return;

      for (const msg of messages) {
        try {
          if (msg.key.remoteJid) {
            saveWaContact(msg.key.remoteJid, msg.pushName);
          }
          if (!msg.message || msg.key.fromMe) continue;
          const remoteJid = msg.key.remoteJid;
          if (
            !remoteJid ||
            remoteJid.endsWith("@g.us") ||
            remoteJid === "status@broadcast"
          ) {
            continue;
          }

          const incomingText =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            "";

          if (!incomingText.trim()) continue;

          const lastTime = replyCooldown.get(remoteJid) || 0;
          if (Date.now() - lastTime < 8000) continue;
          replyCooldown.set(remoteJid, Date.now());

          const senderName = msg.pushName || "Kak";
          const replyText = await generateAutoReplyText(incomingText, senderName);

          await waSock.sendPresenceUpdate("composing", remoteJid).catch(() => {});
          await sleep(1100);
          await waSock.sendMessage(remoteJid, { text: replyText }, { quoted: msg });
          await waSock.sendPresenceUpdate("paused", remoteJid).catch(() => {});

          const logEntry: AutoReplyLog = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            sender: remoteJid.split("@")[0],
            senderName,
            incoming: incomingText,
            reply: replyText,
            timestamp: new Date().toISOString(),
            source: "whatsapp",
          };
          autoReplyLogs.unshift(logEntry);
          if (autoReplyLogs.length > 50) autoReplyLogs.pop();
          broadcastEvent("auto_reply", logEntry);
        } catch (err) {
          console.error("[Auto-Responder Error]:", err);
        }
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memulai Baileys";
    console.error("[WhatsApp Init Error]:", message);
    waState = {
      status: "disconnected",
      qrDataUrl: null,
      user: null,
      lastError: message,
      qrUpdatedAt: null,
    };
    broadcastEvent("wa_status", waState);
  }
}

// ==========================================
// 4. API ROUTES
// ==========================================
app.get("/api/events", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  sseClients.add(res);
  res.write(`event: wa_status\ndata: ${JSON.stringify(waState)}\n\n`);
  res.write(`event: blast_progress\ndata: ${JSON.stringify(blastState)}\n\n`);

  const keepAlive = setInterval(() => {
    res.write(": ping\n\n");
  }, 20000);

  req.on("close", () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

app.get("/api/wa/status", (_req: Request, res: Response) => {
  res.json(waState);
});

app.post("/api/wa/connect", (_req: Request, res: Response) => {
  reconnectAttempts = 0;
  startWhatsApp();
  res.json({ ok: true, message: "Memulai koneksi WhatsApp Multi-Device..." });
});

app.post("/api/wa/logout", async (_req: Request, res: Response) => {
  try {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (waSock) {
      await waSock.logout().catch(() => {});
      waSock.end(undefined);
      waSock = null;
    }
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
    waState = {
      status: "disconnected",
      qrDataUrl: null,
      user: null,
      lastError: null,
      qrUpdatedAt: null,
    };
    broadcastEvent("wa_status", waState);
    res.json({ ok: true, message: "Sesi WhatsApp telah dihapus." });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Gagal reset sesi WhatsApp",
    });
  }
});

app.get("/api/wa/contacts", (_req: Request, res: Response) => {
  const list = Array.from(waContacts.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "id")
  );
  res.json({ contacts: list, connected: waState.status === "connected" });
});

// Multi-Turn Gemini AI Chatbot + Google Search Grounding
app.post("/api/ai/chat", async (req: Request, res: Response) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(400).json({
        error:
          "GEMINI_API_KEY belum terkonfigurasi. Periksa panel Settings > Secrets.",
      });
    }

    const {
      messages = [],
      mode = "strategist",
      useSearchGrounding = true,
      businessProfile,
    } = (req.body || {}) as {
      messages?: Array<{ role: "user" | "model"; text: string }>;
      mode?: "strategist" | "fast";
      useSearchGrounding?: boolean;
      businessProfile?: Partial<AutoResponderConfig>;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Pesan chat tidak boleh kosong." });
    }

    const profile = { ...autoResponderConfig, ...businessProfile };
    const selectedModel =
      mode === "fast" ? "gemini-3.1-flash-lite" : "gemini-4-hydrogen";

    const roleDirective =
      mode === "fast"
        ? "Anda adalah Copywriter WhatsApp cepat & praktis. Berikan jawaban ringkas, langsung ke inti, dan format pesan WhatsApp siap salin."
        : "Anda adalah Senior WhatsApp Marketing Strategist & Business Consultant. Bantu pengguna merancang strategi kampanye, promo musiman, segmentasi audiens, dan copywriting persuasif berbasis data tren terkini.";

    const systemInstruction = `${roleDirective}

Konteks Bisnis Pengguna Saat Ini:
- Nama Usaha: ${profile.businessName || "-"}
- Produk / Jasa: ${profile.productType || "-"}
- Deskripsi: ${profile.description || "-"}
- Target Konsumen: ${profile.targetAudience || "-"}
- Promo Aktif: ${profile.promoType || "-"}
- Gaya Bahasa: ${profile.tone || "Ramah & Santai"}

Aturan Komunikasi:
1. Jawab dalam Bahasa Indonesia yang jelas, terstruktur, dan praktis diterapkan untuk WhatsApp Marketing.
2. Jika menyertakan contoh template pesan WhatsApp, bungkus dengan rapi dan gunakan placeholder {nama} bila relevan.
3. Jika Google Search aktif, manfaatkan informasi terbaru dari web untuk tren, tanggal penting, atau referensi harga/pasar.`;

    const contents = messages
      .filter((m) => m.text && m.text.trim())
      .map((m) => ({
        role: m.role === "model" ? "model" : "user",
        parts: [{ text: m.text }],
      }));

    const enableSearch = useSearchGrounding && selectedModel === "gemini-4-hydrogen";

    const response = await ai.models.generateContent({
      model: selectedModel,
      contents,
      config: {
        systemInstruction,
        ...(enableSearch ? { tools: [{ googleSearch: {} }] } : {}),
      },
    });

    const rawChunks =
      response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources: Array<{ title: string; uri: string }> = [];
    const seenUris = new Set<string>();

    for (const chunk of rawChunks) {
      const web = (chunk as { web?: { uri?: string; title?: string } }).web;
      if (web?.uri && !seenUris.has(web.uri)) {
        seenUris.add(web.uri);
        sources.push({
          title: web.title || web.uri,
          uri: web.uri,
        });
      }
    }

    res.json({
      reply: response.text?.trim() || "Maaf, tidak ada respons yang dihasilkan.",
      model: selectedModel,
      searchUsed: enableSearch && sources.length > 0,
      sources,
    });
  } catch (err) {
    console.error("[Gemini Chatbot Error]:", err);
    const message =
      err instanceof Error ? err.message : "Gagal memproses chat Gemini AI.";
    res.status(500).json({ error: message });
  }
});

// Verifikasi Nomor WhatsApp Aktif Massal via Baileys
app.post("/api/wa/check-numbers", async (req: Request, res: Response) => {
  try {
    if (waState.status !== "connected" || !waSock) {
      return res.status(400).json({
        error:
          "WhatsApp belum terhubung. Silakan scan QR Code di menu Pairing WhatsApp terlebih dahulu untuk memverifikasi nomor.",
      });
    }

    const { numbersText = "" } = (req.body || {}) as { numbersText?: string };
    const lines = String(numbersText)
      .split(/[\n,;]+/)
      .map((l) => l.trim())
      .filter(Boolean);

    const parsed: Array<{ number: string; name: string }> = [];
    const seen = new Set<string>();

    for (const line of lines) {
      const [rawNum = "", rawName = ""] = line.split("|").map((p) => p.trim());
      const normalized = normalizePhoneNumber(rawNum);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        parsed.push({ number: normalized, name: rawName || "Calon Konsumen" });
      }
    }

    if (parsed.length === 0) {
      return res.status(400).json({
        error: "Masukkan minimal satu nomor telepon valid untuk diperiksa.",
      });
    }

    if (parsed.length > 100) {
      return res.status(400).json({
        error: "Maksimal 100 nomor per sekali pengecekan untuk keamanan akun.",
      });
    }

    const results: Array<{ number: string; name: string; exists: boolean }> = [];
    const batchSize = 20;

    for (let i = 0; i < parsed.length; i += batchSize) {
      const batch = parsed.slice(i, i + batchSize);
      const jids = batch.map((b) => `${b.number}@s.whatsapp.net`);
      const checked = await waSock.onWhatsApp(...jids);
      const existsMap = new Map<string, boolean>();

      for (const entry of checked || []) {
        const cleanNum = entry.jid.split("@")[0];
        existsMap.set(cleanNum, Boolean(entry.exists));
      }

      for (const item of batch) {
        results.push({
          number: item.number,
          name: item.name,
          exists: existsMap.get(item.number) ?? false,
        });
      }
    }

    res.json({ results });
  } catch (err) {
    console.error("[Check Numbers Error]:", err);
    res.status(500).json({
      error:
        err instanceof Error
          ? err.message
          : "Gagal memeriksa status nomor WhatsApp.",
    });
  }
});

// Pencarian Leads Bisnis Publik via Gemini Google Search Grounding
app.post("/api/leads/search", async (req: Request, res: Response) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(400).json({
        error:
          "GEMINI_API_KEY belum terkonfigurasi. Periksa panel Settings > Secrets.",
      });
    }

    const {
      targetKeyword = "",
      location = "",
      businessProfile,
    } = (req.body || {}) as {
      targetKeyword?: string;
      location?: string;
      businessProfile?: Partial<AutoResponderConfig>;
    };

    if (!targetKeyword.trim()) {
      return res.status(400).json({
        error: "Kata kunci target bisnis wajib diisi (contoh: Kedai Kopi atau Klinik Gigi).",
      });
    }

    const profile = { ...autoResponderConfig, ...businessProfile };
    const areaText = location.trim() ? `di ${location.trim()}` : "di Indonesia";

    const prompt = `Carikan daftar usaha / bisnis / organisasi publik yang relevan untuk target "${targetKeyword.trim()}" ${areaText} sebagai calon mitra/konsumen B2B bagi usaha "${profile.businessName || "bisnis kami"}" (${profile.productType || "produk/jasa"}).

Instruksi Ketat:
1. Gunakan hasil pencarian Google Search nyata. JANGAN PERNAH mengarang atau menebak nomor telepon atau nama usaha yang tidak muncul di hasil pencarian.
2. Untuk setiap usaha/direktori yang ditemukan, tampilkan:
   - Nama Usaha / Lembaga
   - Kota / Lokasi singkat
   - Nomor Telepon / WhatsApp publik (HANYA jika tercantum di sumber web; jika tidak ditemukan di snippet, tulis "Tidak tercantum di cuplikan web")
   - Jenis usaha / catatan singkat relevansinya.
3. Di bagian akhir, berikan 3 query pencarian spesifik yang bisa digunakan pengguna untuk menemukan lebih banyak kontak publik di direktori/media sosial.`;

    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const summaryText = response.text?.trim() || "";

    // Extract publicly visible phone numbers from the grounded response text
    const phoneRegex = /(?:\+62|62|08)[0-9\-\s().]{7,16}/g;
    const rawMatches = summaryText.match(phoneRegex) || [];
    const extractedNumbers: string[] = [];
    const seenNums = new Set<string>();

    for (const raw of rawMatches) {
      const norm = normalizePhoneNumber(raw);
      if (norm && norm.length >= 10 && norm.length <= 15 && !seenNums.has(norm)) {
        seenNums.add(norm);
        extractedNumbers.push(norm);
      }
    }

    const rawChunks =
      response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources: Array<{ title: string; uri: string }> = [];
    const seenUris = new Set<string>();

    for (const chunk of rawChunks) {
      const web = (chunk as { web?: { uri?: string; title?: string } }).web;
      if (web?.uri && !seenUris.has(web.uri)) {
        seenUris.add(web.uri);
        sources.push({
          title: web.title || web.uri,
          uri: web.uri,
        });
      }
    }

    res.json({
      summary: summaryText,
      extractedNumbers,
      sources,
    });
  } catch (err) {
    console.error("[Lead Search Error]:", err);
    res.status(500).json({
      error:
        err instanceof Error
          ? err.message
          : "Gagal mencari referensi leads melalui Google Search.",
    });
  }
});

// AI Copywriting Generator
app.post("/api/ai/copywriting", async (req: Request, res: Response) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(400).json({
        error:
          "GEMINI_API_KEY belum terkonfigurasi. Periksa panel Settings > Secrets.",
      });
    }

    const {
      businessName = "",
      productType = "",
      description = "",
      targetAudience = "",
      promoType = "",
      tone = "Ramah & Santai",
      customPrompt = "",
    } = (req.body || {}) as Record<string, string>;

    if (!businessName.trim() || !productType.trim()) {
      return res.status(400).json({
        error: "Nama usaha dan jenis produk/jasa wajib diisi terlebih dahulu.",
      });
    }

    const prompt = `Buatkan 3 variasi pesan WhatsApp Marketing siap kirim berdasarkan profil bisnis berikut:
- Nama Usaha: ${businessName}
- Produk / Jasa: ${productType}
- Deskripsi & Keunggulan: ${description || "-"}
- Target Konsumen: ${targetAudience || "Umum"}
- Jenis Promo / Penawaran: ${promoType || "-"}
- Gaya Bahasa (Tone): ${tone}
- Instruksi Tambahan: ${customPrompt || "-"}

Ketentuan Wajib:
1. Sertakan placeholder {nama} di kalimat sapaan awal agar bisa dipersonalisasi otomatis saat blast.
2. Gunakan format WhatsApp (*tebal* untuk penawaran/promo, _miring_ seperlunya, paragraf ringkas yang nyaman dibaca di layar HP).
3. Akhiri dengan Call-To-Action (CTA) yang jelas dan mudah ditindaklanjuti (misal membalas pesan ini).
4. Berikan 3 pendekatan berbeda: (1) Manfaat & Solusi Pelanggan, (2) Highlight Promo & Urgensi, (3) Pendekatan Personal / Storytelling singkat.`;

    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            variations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: {
                    type: Type.STRING,
                    description: "Judul singkat variasi copywriting",
                  },
                  angle: {
                    type: Type.STRING,
                    description: "Sudut pandang marketing yang digunakan",
                  },
                  message: {
                    type: Type.STRING,
                    description: "Teks pesan WhatsApp siap kirim",
                  },
                },
                required: ["title", "angle", "message"],
              },
            },
          },
          required: ["variations"],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{"variations":[]}');
    res.json(parsed);
  } catch (err) {
    console.error("[Gemini Copywriting Error]:", err);
    const message =
      err instanceof Error ? err.message : "Gagal menghasilkan copywriting AI.";
    res.status(500).json({ error: message });
  }
});

// Auto-Responder Config, Logs & Live Simulation
app.get("/api/autoresponder/config", (_req: Request, res: Response) => {
  res.json({ config: autoResponderConfig, logs: autoReplyLogs });
});

app.post("/api/autoresponder/config", (req: Request, res: Response) => {
  autoResponderConfig = {
    ...autoResponderConfig,
    ...(req.body as Partial<AutoResponderConfig>),
  };
  res.json({ ok: true, config: autoResponderConfig });
});

app.post("/api/autoresponder/test", async (req: Request, res: Response) => {
  try {
    const {
      message = "",
      senderName = "Pelanggan",
      profileOverride,
    } = (req.body || {}) as {
      message?: string;
      senderName?: string;
      profileOverride?: Partial<AutoResponderConfig>;
    };

    if (!message.trim()) {
      return res.status(400).json({ error: "Pesan simulasi tidak boleh kosong." });
    }

    const reply = await generateAutoReplyText(
      message,
      senderName,
      profileOverride
    );

    const logEntry: AutoReplyLog = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sender: "Simulasi Uji",
      senderName,
      incoming: message,
      reply,
      timestamp: new Date().toISOString(),
      source: "simulation",
    };
    autoReplyLogs.unshift(logEntry);
    if (autoReplyLogs.length > 50) autoReplyLogs.pop();
    broadcastEvent("auto_reply", logEntry);

    res.json({ reply, log: logEntry });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Gagal menjalankan simulasi AI.";
    res.status(500).json({ error: msg });
  }
});

// Mass Blast Engine (Anti-Ban Randomized Delay)
app.get("/api/blast/status", (_req: Request, res: Response) => {
  res.json(blastState);
});

app.post("/api/blast/stop", (_req: Request, res: Response) => {
  stopBlastRequested = true;
  res.json({
    ok: true,
    message: "Permintaan penghentian dikirim. Antrean akan berhenti setelah pesan saat ini.",
  });
});

app.post("/api/blast/start", async (req: Request, res: Response) => {
  if (blastState.running) {
    return res.status(409).json({ error: "Proses blast masih berjalan." });
  }

  if (waState.status !== "connected" || !waSock) {
    return res.status(400).json({
      error:
        "WhatsApp belum terhubung. Silakan scan QR Code di menu WhatsApp Pairing terlebih dahulu.",
    });
  }

  const {
    numbersText = "",
    messageTemplate = "",
    minDelaySec = 3,
    maxDelaySec = 5,
  } = (req.body || {}) as {
    numbersText?: string;
    messageTemplate?: string;
    minDelaySec?: number;
    maxDelaySec?: number;
  };

  if (!messageTemplate.trim()) {
    return res.status(400).json({ error: "Kotak pesan blast tidak boleh kosong." });
  }

  const rawLines = String(numbersText)
    .split(/[\n,;]+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const recipients: BlastItem[] = [];
  const seen = new Set<string>();

  for (const line of rawLines) {
    const [rawNum = "", rawName = ""] = line.split("|").map((p) => p.trim());
    const normalized = normalizePhoneNumber(rawNum);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      recipients.push({
        number: normalized,
        name: rawName || "Kak",
        status: "queued",
        error: null,
        sentAt: null,
      });
    }
  }

  if (recipients.length === 0) {
    return res.status(400).json({
      error: "Tidak ditemukan nomor WhatsApp yang valid. Gunakan format 0812xxx atau 62812xxx.",
    });
  }

  const minMs = Math.max(2, Number(minDelaySec) || 3) * 1000;
  const maxMs = Math.max(minMs, (Number(maxDelaySec) || 5) * 1000);

  stopBlastRequested = false;
  blastState = {
    running: true,
    total: recipients.length,
    sent: 0,
    failed: 0,
    currentTarget: null,
    delayCountdownSec: 0,
    items: recipients,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  broadcastEvent("blast_progress", blastState);

  res.json({ ok: true, total: recipients.length });

  (async () => {
    for (let i = 0; i < blastState.items.length; i++) {
      if (stopBlastRequested) break;

      const item = blastState.items[i];
      item.status = "sending";
      blastState.currentTarget = item.number;
      blastState.delayCountdownSec = 0;
      broadcastEvent("blast_progress", blastState);

      const personalized = messageTemplate.replace(/\{nama\}/gi, item.name);
      const jid = `${item.number}@s.whatsapp.net`;

      try {
        await waSock!.sendPresenceUpdate("composing", jid).catch(() => {});
        await sleep(600);
        await waSock!.sendMessage(jid, { text: personalized });
        await waSock!.sendPresenceUpdate("paused", jid).catch(() => {});
        item.status = "sent";
        item.sentAt = new Date().toISOString();
        blastState.sent += 1;
      } catch (err) {
        item.status = "failed";
        item.error = err instanceof Error ? err.message : "Gagal mengirim pesan";
        blastState.failed += 1;
      }

      broadcastEvent("blast_progress", blastState);

      if (i < blastState.items.length - 1 && !stopBlastRequested) {
        const waitMs = randomDelay(minMs, maxMs);
        let remainingSec = Math.ceil(waitMs / 1000);
        while (remainingSec > 0 && !stopBlastRequested) {
          blastState.delayCountdownSec = remainingSec;
          broadcastEvent("blast_progress", blastState);
          await sleep(1000);
          remainingSec -= 1;
        }
        blastState.delayCountdownSec = 0;
      }
    }

    blastState.running = false;
    blastState.currentTarget = null;
    blastState.delayCountdownSec = 0;
    blastState.finishedAt = new Date().toISOString();
    broadcastEvent("blast_progress", blastState);
  })();
});

// Serve the 3-file GitHub Codespaces Starter for easy inspection & copy
app.get("/api/codespaces-files", (_req: Request, res: Response) => {
  const filesToRead = [
    { key: "package.json", relPath: "package.json", language: "json" },
    { key: "index.js", relPath: "index.js", language: "javascript" },
    { key: "public/index.html", relPath: "public/index.html", language: "html" },
    { key: ".env.example", relPath: ".env.example", language: "env" },
    { key: ".gitignore", relPath: ".gitignore", language: "gitignore" },
    { key: "README.md", relPath: "README.md", language: "markdown" },
  ];

  const files = filesToRead.map((file) => {
    const fullPath = path.join(CODESPACES_DIR, file.relPath);
    const content = fs.existsSync(fullPath)
      ? fs.readFileSync(fullPath, "utf-8")
      : "";
    return { ...file, content };
  });

  res.json({ files });
});

// ==========================================
// 5. VITE MIDDLEWARE / PRODUCTION STATIC
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀 KirimAI Fullstack Server aktif di http://localhost:${PORT}`);
    // Auto-start Baileys connection so terminal QR & web QR appear immediately
    startWhatsApp();
  });
}

startServer();
