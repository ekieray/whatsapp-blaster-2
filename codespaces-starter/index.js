import "dotenv/config";
import express from "express";
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

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const AUTH_DIR = path.join(__dirname, "auth_info_baileys");

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// ==========================================
// 1. STATE WHATSAPP, AUTO-RESPONDER & BLAST
// ==========================================
let waSock = null;
let waState = {
  status: "disconnected", // disconnected | connecting | qr_ready | connected
  qrDataUrl: null,
  user: null,
  lastError: null,
};

let autoResponderConfig = {
  enabled: false,
  businessName: "Kopi Senja Nusantara",
  productType: "Kopi Arabika & Minuman Kekinian",
  description: "Biji kopi pilihan single origin, tersedia kemasan botol 1L & kopi susu gula aren.",
  targetAudience: "Pekerja kantoran, mahasiswa, pecinta kopi",
  promoType: "Diskon 20% pembelian pertama + Gratis Ongkir area kota",
  tone: "Ramah & Santai",
  faqNotes: "Buka setiap hari pukul 08.00 - 22.00 WIB. Pengiriman via kurir instan.",
};

const autoReplyLogs = [];
const replyCooldown = new Map();
const waContacts = new Map();

function saveWaContact(jid, name) {
  if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast" || jid.endsWith("@lid")) {
    return;
  }
  const normalized = normalizePhoneNumber(jid.split("@")[0]);
  if (!normalized) return;
  const existing = waContacts.get(normalized);
  const cleanName = (name || "").trim();
  waContacts.set(normalized, {
    number: normalized,
    name: cleanName || existing?.name || "Kontak WhatsApp",
  });
}

let blastState = {
  running: false,
  total: 0,
  sent: 0,
  failed: 0,
  currentTarget: null,
  items: [], // { number, name, status, error, sentAt }
  startedAt: null,
  finishedAt: null,
};
let stopBlastRequested = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomDelay = (minMs, maxMs) =>
  Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;

function normalizePhoneNumber(raw) {
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) {
    return "62" + digits.slice(1);
  }
  if (digits.startsWith("8")) {
    return "62" + digits;
  }
  return digits;
}

// ==========================================
// 2. KONEKSI WHATSAPP MULTI-DEVICE (BAILEYS)
// ==========================================
async function startWhatsApp() {
  if (waState.status === "connecting") return;

  try {
    waState = {
      status: "connecting",
      qrDataUrl: null,
      user: null,
      lastError: null,
    };

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    waSock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: "silent" }),
      browser: Browsers.ubuntu("KirimAI"),
      printQRInTerminal: false,
    });

    waSock.ev.on("creds.update", saveCreds);

    waSock.ev.on("messaging-history.set", ({ contacts, chats }) => {
      for (const c of contacts || []) saveWaContact(c.id, c.name || c.notify || c.verifiedName);
      for (const ch of chats || []) saveWaContact(ch.id, ch.name);
    });
    waSock.ev.on("contacts.upsert", (contacts) => {
      for (const c of contacts) saveWaContact(c.id, c.name || c.notify || c.verifiedName);
    });
    waSock.ev.on("contacts.update", (updates) => {
      for (const c of updates) saveWaContact(c.id, c.name || c.notify || c.verifiedName);
    });

    waSock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log("\n[WhatsApp] Scan QR Code di bawah ini dengan HP Anda:");
        qrcodeTerminal.generate(qr, { small: true });
        waState.status = "qr_ready";
        waState.qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 2 });
        waState.lastError = null;
      }

      if (connection === "open") {
        console.log("[WhatsApp] Berhasil terhubung:", waSock.user?.id);
        waState.status = "connected";
        waState.qrDataUrl = null;
        waState.user = {
          id: waSock.user?.id || "",
          name: waSock.user?.name || "WhatsApp Connected",
        };
        waState.lastError = null;
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        waState.status = "disconnected";
        waState.qrDataUrl = null;
        waState.user = null;
        waState.lastError = lastDisconnect?.error?.message || "Koneksi terputus";

        if (shouldReconnect) {
          console.log("[WhatsApp] Koneksi terputus, mencoba hubungkan ulang dalam 5 detik...");
          setTimeout(() => startWhatsApp(), 5000);
        } else {
          console.log("[WhatsApp] Sesi logout. Hapus folder auth untuk scan ulang.");
        }
      }
    });

    // Auto-Responder AI saat pesan masuk
    waSock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify" || !autoResponderConfig.enabled) return;

      for (const msg of messages) {
        try {
          if (msg.key.remoteJid) saveWaContact(msg.key.remoteJid, msg.pushName);
          if (!msg.message || msg.key.fromMe) continue;
          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") {
            continue;
          }

          const incomingText =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            "";

          if (!incomingText.trim()) continue;

          // Anti-spam cooldown 8 detik per pengirim
          const lastTime = replyCooldown.get(remoteJid) || 0;
          if (Date.now() - lastTime < 8000) continue;
          replyCooldown.set(remoteJid, Date.now());

          const senderName = msg.pushName || "Kak";
          const replyText = await generateAutoReply(incomingText, senderName);

          await waSock.sendPresenceUpdate("composing", remoteJid);
          await sleep(1200);
          await waSock.sendMessage(remoteJid, { text: replyText }, { quoted: msg });
          await waSock.sendPresenceUpdate("paused", remoteJid);

          autoReplyLogs.unshift({
            id: Date.now().toString(),
            sender: remoteJid.split("@")[0],
            senderName,
            incoming: incomingText,
            reply: replyText,
            timestamp: new Date().toISOString(),
          });
          if (autoReplyLogs.length > 50) autoReplyLogs.pop();
        } catch (err) {
          console.error("[Auto-Responder Error]:", err.message);
        }
      }
    });
  } catch (err) {
    console.error("[WhatsApp Init Error]:", err);
    waState.status = "disconnected";
    waState.lastError = err.message;
  }
}

async function generateAutoReply(incomingText, senderName) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY belum diatur di file .env");
  }

  const systemInstruction = `Anda adalah Customer Service & Sales Assistant resmi untuk bisnis berikut:
- Nama Usaha: ${autoResponderConfig.businessName}
- Produk/Jasa: ${autoResponderConfig.productType}
- Deskripsi & Keunggulan: ${autoResponderConfig.description}
- Target Konsumen: ${autoResponderConfig.targetAudience}
- Promo Aktif: ${autoResponderConfig.promoType}
- Info Tambahan/FAQ: ${autoResponderConfig.faqNotes}
- Gaya Bahasa: ${autoResponderConfig.tone}

Aturan Membalas WhatsApp:
1. Sapa pelanggan dengan sopan menggunakan nama "${senderName}" bila relevan.
2. Jawab singkat, padat, ramah, dan langsung pada inti (maksimal 3-4 kalimat).
3. Arahkan pelanggan secara halus ke penawaran/promo jika sesuai konteks.
4. Gunakan format WhatsApp ringan (*tebal* untuk poin penting) dan hindari mengarang informasi yang tidak ada di data bisnis.`;

  const response = await ai.models.generateContent({
    model: "gemini-4-hydrogen",
    contents: `Pesan masuk dari pelanggan (${senderName}): "${incomingText}"`,
    config: { systemInstruction },
  });

  return (response.text || "Terima kasih sudah menghubungi kami! Ada yang bisa kami bantu?").trim();
}

// ==========================================
// 3. ENDPOINT API
// ==========================================
app.get("/api/wa/status", (req, res) => {
  res.json(waState);
});

app.post("/api/wa/connect", async (req, res) => {
  startWhatsApp();
  res.json({ ok: true, message: "Memulai koneksi WhatsApp..." });
});

app.post("/api/wa/logout", async (req, res) => {
  try {
    if (waSock) {
      await waSock.logout().catch(() => {});
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
    };
    res.json({ ok: true, message: "Sesi WhatsApp berhasil dihapus." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/wa/contacts", (req, res) => {
  const list = Array.from(waContacts.values()).sort((a, b) => a.name.localeCompare(b.name, "id"));
  res.json({ contacts: list, connected: waState.status === "connected" });
});

// Multi-Turn Gemini AI Chatbot + Google Search Grounding
app.post("/api/ai/chat", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(400).json({ error: "GEMINI_API_KEY belum diatur pada environment." });
    }
    const {
      messages = [],
      mode = "strategist",
      useSearchGrounding = true,
      businessProfile = {},
    } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Pesan chat tidak boleh kosong." });
    }

    const profile = { ...autoResponderConfig, ...businessProfile };
    const selectedModel = mode === "fast" ? "gemini-3.1-flash-lite" : "gemini-4-hydrogen";
    const enableSearch = useSearchGrounding && selectedModel === "gemini-4-hydrogen";

    const systemInstruction = `Anda adalah Senior WhatsApp Marketing Strategist untuk usaha "${profile.businessName}" (Produk: ${profile.productType}, Target: ${profile.targetAudience}, Promo: ${profile.promoType}, Tone: ${profile.tone}). Jawab ringkas, praktis dalam Bahasa Indonesia, dan sertakan placeholder {nama} jika menulis contoh pesan WhatsApp.`;

    const contents = messages
      .filter((m) => m.text && m.text.trim())
      .map((m) => ({ role: m.role === "model" ? "model" : "user", parts: [{ text: m.text }] }));

    const response = await ai.models.generateContent({
      model: selectedModel,
      contents,
      config: {
        systemInstruction,
        ...(enableSearch ? { tools: [{ googleSearch: {} }] } : {}),
      },
    });

    const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = [];
    const seen = new Set();
    for (const chunk of rawChunks) {
      if (chunk.web?.uri && !seen.has(chunk.web.uri)) {
        seen.add(chunk.web.uri);
        sources.push({ title: chunk.web.title || chunk.web.uri, uri: chunk.web.uri });
      }
    }

    res.json({
      reply: (response.text || "").trim(),
      model: selectedModel,
      sources,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Gagal memproses chat Gemini AI." });
  }
});

// AI Copywriting Endpoint
app.post("/api/ai/copywriting", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(400).json({ error: "GEMINI_API_KEY belum diatur pada environment." });
    }

    const {
      businessName = "",
      productType = "",
      description = "",
      targetAudience = "",
      promoType = "",
      tone = "Ramah & Persuasif",
      customPrompt = "",
    } = req.body || {};

    if (!businessName || !productType) {
      return res.status(400).json({ error: "Nama usaha dan jenis produk wajib diisi." });
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
1. Gunakan placeholder {nama} di kalimat sapaan pembuka agar bisa dipersonalisasi saat blast.
2. Gunakan format WhatsApp (*tebal* untuk highlight promo, _miring_ secukupnya, baris rapi).
3. Sertakan Call-To-Action (CTA) yang jelas di akhir pesan.
4. Buat 3 sudut pandang berbeda: (1) Fokus Manfaat & Solusi, (2) Fokus Promo & Urgensi, (3) Pendekatan Ramah / Storytelling singkat.`;

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
                  title: { type: Type.STRING },
                  angle: { type: Type.STRING },
                  message: { type: Type.STRING },
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
    res.status(500).json({ error: err.message || "Gagal menghasilkan copywriting AI." });
  }
});

// Auto-Responder Config & Test
app.get("/api/autoresponder/config", (req, res) => {
  res.json({ config: autoResponderConfig, logs: autoReplyLogs });
});

app.post("/api/autoresponder/config", (req, res) => {
  autoResponderConfig = { ...autoResponderConfig, ...req.body };
  res.json({ ok: true, config: autoResponderConfig });
});

app.post("/api/autoresponder/test", async (req, res) => {
  try {
    const { message, senderName = "Calon Pembeli" } = req.body || {};
    if (!message) return res.status(400).json({ error: "Pesan simulasi wajib diisi." });
    const reply = await generateAutoReply(message, senderName);
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mass Blast Endpoint dengan Anti-Banned Delay (3-5 detik)
app.get("/api/blast/status", (req, res) => {
  res.json(blastState);
});

app.post("/api/blast/stop", (req, res) => {
  stopBlastRequested = true;
  res.json({ ok: true, message: "Menghentikan proses blast setelah pesan saat ini..." });
});

app.post("/api/blast/start", async (req, res) => {
  if (blastState.running) {
    return res.status(409).json({ error: "Proses blast sedang berjalan." });
  }
  if (waState.status !== "connected" || !waSock) {
    return res.status(400).json({ error: "WhatsApp belum terhubung. Scan QR Code terlebih dahulu." });
  }

  const {
    numbersText = "",
    messageTemplate = "",
    minDelaySec = 3,
    maxDelaySec = 5,
  } = req.body || {};

  if (!messageTemplate.trim()) {
    return res.status(400).json({ error: "Isi pesan blast tidak boleh kosong." });
  }

  // Parse format: "08123456789" atau "08123456789|Budi"
  const lines = String(numbersText)
    .split(/[\n,;]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const recipients = [];
  const seen = new Set();

  for (const line of lines) {
    const [rawNum, rawName] = line.split("|").map((s) => s.trim());
    const normalized = normalizePhoneNumber(rawNum);
    if (normalized && normalized.length >= 9 && !seen.has(normalized)) {
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
    return res.status(400).json({ error: "Tidak ada nomor WhatsApp valid yang ditemukan." });
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
    items: recipients,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };

  res.json({ ok: true, total: recipients.length });

  // Jalankan antrean di background agar non-blocking
  (async () => {
    for (let i = 0; i < blastState.items.length; i++) {
      if (stopBlastRequested) break;

      const item = blastState.items[i];
      item.status = "sending";
      blastState.currentTarget = item.number;

      const personalizedMsg = messageTemplate.replace(/\{nama\}/gi, item.name);
      const jid = `${item.number}@s.whatsapp.net`;

      try {
        await waSock.sendPresenceUpdate("composing", jid).catch(() => {});
        await sleep(600);
        await waSock.sendMessage(jid, { text: personalizedMsg });
        item.status = "sent";
        item.sentAt = new Date().toISOString();
        blastState.sent += 1;
      } catch (err) {
        item.status = "failed";
        item.error = err.message || "Gagal mengirim";
        blastState.failed += 1;
      }

      // Anti-Banned Delay otomatis 3-5 detik antar pengiriman
      if (i < blastState.items.length - 1 && !stopBlastRequested) {
        const waitMs = randomDelay(minMs, maxMs);
        await sleep(waitMs);
      }
    }

    blastState.running = false;
    blastState.currentTarget = null;
    blastState.finishedAt = new Date().toISOString();
  })();
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀 KirimAI Server berjalan di http://localhost:${PORT}`);
  startWhatsApp();
});
