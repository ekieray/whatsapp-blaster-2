import { useMemo, useRef, useState } from "react";
import {
  Send,
  Square,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  Eye,
  Edit3,
  Contact,
  Upload,
  Users,
  Search,
  X,
} from "lucide-react";
import type { BlastState, WaContact, WaState } from "../types";

interface BlastComposerProps {
  numbersText: string;
  onNumbersChange: (val: string) => void;
  messageTemplate: string;
  onMessageChange: (val: string) => void;
  blastState: BlastState;
  waState: WaState;
  onGoToPairing: () => void;
  onRefreshBlast: () => void;
}

interface NavigatorWithContacts extends Navigator {
  contacts?: {
    select: (
      properties: string[],
      options?: { multiple?: boolean }
    ) => Promise<Array<{ name?: string[]; tel?: string[] }>>;
  };
}

function normalizeClientPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits || digits.length < 8) return null;
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("8")) return "62" + digits;
  return digits;
}

function parseVcfContacts(vcfContent: string): Array<{ number: string; name: string }> {
  const results: Array<{ number: string; name: string }> = [];
  const cards = vcfContent.split(/BEGIN:VCARD/i);

  for (const card of cards) {
    if (!card.trim()) continue;
    let name = "Kontak HP";

    const fnMatch = card.match(/^FN[^:]*:(.*)$/im);
    const nMatch = card.match(/^N[^:]*:(.*)$/im);
    if (fnMatch?.[1]?.trim()) {
      name = fnMatch[1].trim();
    } else if (nMatch?.[1]?.trim()) {
      name = nMatch[1]
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .reverse()
        .join(" ");
    }

    const telMatches = card.matchAll(/^TEL[^:]*:(.*)$/gim);
    for (const match of telMatches) {
      const normalized = normalizeClientPhone(match[1] || "");
      if (normalized) {
        results.push({ number: normalized, name });
      }
    }
  }
  return results;
}

function parseCsvOrTextContacts(content: string): Array<{ number: string; name: string }> {
  const results: Array<{ number: string; name: string }> = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Support CSV ("Nama,0812xxx" or "0812xxx,Nama") or pipe ("0812xxx|Nama")
    const parts = trimmed.split(/[;,|\t]/).map((p) => p.replace(/^"|"$/g, "").trim());
    if (parts.length >= 2) {
      const numFirst = normalizeClientPhone(parts[0]);
      const numSecond = normalizeClientPhone(parts[1]);
      if (numFirst) {
        results.push({ number: numFirst, name: parts[1] || "Kontak HP" });
      } else if (numSecond) {
        results.push({ number: numSecond, name: parts[0] || "Kontak HP" });
      }
    } else {
      const single = normalizeClientPhone(trimmed);
      if (single) results.push({ number: single, name: "Kak" });
    }
  }
  return results;
}

export function BlastComposer({
  numbersText,
  onNumbersChange,
  messageTemplate,
  onMessageChange,
  blastState,
  waState,
  onGoToPairing,
  onRefreshBlast,
}: BlastComposerProps) {
  const [minDelaySec, setMinDelaySec] = useState(3);
  const [maxDelaySec, setMaxDelaySec] = useState(5);
  const [previewMode, setPreviewMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contactNotice, setContactNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "sent" | "failed" | "queued">("all");

  // WhatsApp synced contacts drawer state
  const [showWaContacts, setShowWaContacts] = useState(false);
  const [waContacts, setWaContacts] = useState<WaContact[]>([]);
  const [waContactsLoading, setWaContactsLoading] = useState(false);
  const [waContactQuery, setWaContactQuery] = useState("");
  const [selectedWaNumbers, setSelectedWaNumbers] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const parsedRecipients = useMemo(() => {
    const lines = numbersText
      .split(/[\n,;]+/)
      .map((l) => l.trim())
      .filter(Boolean);
    const unique = new Map<string, string>();
    for (const line of lines) {
      const [rawNum = "", rawName = ""] = line.split("|").map((s) => s.trim());
      const normalized = normalizeClientPhone(rawNum);
      if (normalized && !unique.has(normalized)) {
        unique.set(normalized, rawName || "Kak");
      }
    }
    return Array.from(unique.entries()).map(([number, name]) => ({ number, name }));
  }, [numbersText]);

  const appendContactsToList = (incoming: Array<{ number: string; name: string }>) => {
    const existingMap = new Map<string, string>();
    for (const item of parsedRecipients) {
      existingMap.set(item.number, item.name);
    }

    let addedCount = 0;
    for (const contact of incoming) {
      const normalized = normalizeClientPhone(contact.number);
      if (normalized && !existingMap.has(normalized)) {
        existingMap.set(normalized, contact.name || "Kak");
        addedCount += 1;
      }
    }

    const mergedLines = Array.from(existingMap.entries()).map(
      ([number, name]) => `${number}|${name}`
    );
    onNumbersChange(mergedLines.join("\n"));
    return addedCount;
  };

  const handlePickPhoneContacts = async () => {
    setError(null);
    setContactNotice(null);
    const nav = navigator as NavigatorWithContacts;

    if (!nav.contacts || typeof nav.contacts.select !== "function") {
      setContactNotice(
        "Pemilih Kontak HP langsung (Contact Picker API) hanya tersedia di browser HP Android (Chrome) di luar iframe. Gunakan tombol 'Import .VCF / .CSV' (ekspor kontak dari Android/iPhone) atau 'Kontak WhatsApp'."
      );
      return;
    }

    try {
      const selected = await nav.contacts.select(["name", "tel"], { multiple: true });
      const extracted: Array<{ number: string; name: string }> = [];

      for (const person of selected) {
        const displayName = person.name?.[0]?.trim() || "Kontak HP";
        for (const tel of person.tel || []) {
          const normalized = normalizeClientPhone(tel);
          if (normalized) {
            extracted.push({ number: normalized, name: displayName });
          }
        }
      }

      if (extracted.length === 0) {
        setContactNotice("Tidak ada nomor telepon valid yang dipilih.");
        return;
      }

      const added = appendContactsToList(extracted);
      setContactNotice(`${added} nomor baru berhasil dimasukkan dari Kontak HP.`);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setContactNotice(
        "Akses Contact Picker diblokir oleh frame/browser ini. Silakan gunakan tombol 'Import .VCF / .CSV' dari file ekspor kontak HP."
      );
    }
  };

  const handleImportContactFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    setContactNotice(null);

    try {
      const text = await file.text();
      const isVcf =
        file.name.toLowerCase().endsWith(".vcf") ||
        file.name.toLowerCase().endsWith(".vcard") ||
        /BEGIN:VCARD/i.test(text);

      const parsed = isVcf ? parseVcfContacts(text) : parseCsvOrTextContacts(text);
      if (parsed.length === 0) {
        setContactNotice("Tidak ditemukan nomor telepon valid di dalam file kontak tersebut.");
        return;
      }

      const added = appendContactsToList(parsed);
      setContactNotice(
        `${added} nomor baru ditambahkan dari file ${file.name} (${parsed.length} nomor terbaca).`
      );
    } catch {
      setContactNotice("Gagal membaca file kontak. Pastikan format .vcf, .csv, atau .txt.");
    }
  };

  const handleOpenWaContacts = async () => {
    setShowWaContacts((prev) => !prev);
    if (showWaContacts) return;

    setWaContactsLoading(true);
    try {
      const res = await fetch("/api/wa/contacts");
      const data = await res.json();
      setWaContacts(data.contacts || []);
    } catch {
      setWaContacts([]);
    } finally {
      setWaContactsLoading(false);
    }
  };

  const toggleWaContact = (number: string) => {
    setSelectedWaNumbers((prev) => {
      const next = new Set(prev);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  };

  const handleApplySelectedWaContacts = () => {
    const chosen = waContacts.filter((c) => selectedWaNumbers.has(c.number));
    const added = appendContactsToList(chosen);
    setContactNotice(`${added} kontak WhatsApp ditambahkan ke daftar tujuan.`);
    setSelectedWaNumbers(new Set());
    setShowWaContacts(false);
  };

  const filteredWaContacts = useMemo(() => {
    const q = waContactQuery.trim().toLowerCase();
    if (!q) return waContacts;
    return waContacts.filter(
      (c) => c.name.toLowerCase().includes(q) || c.number.includes(q)
    );
  }, [waContacts, waContactQuery]);

  const previewText = useMemo(() => {
    const sampleName = parsedRecipients[0]?.name || "Budi";
    return messageTemplate.replace(/\{nama\}/gi, sampleName);
  }, [messageTemplate, parsedRecipients]);

  const handleStartBlast = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/blast/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numbersText,
          messageTemplate,
          minDelaySec,
          maxDelaySec,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal memulai proses blast.");
      }
      onRefreshBlast();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memulai blast.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStopBlast = async () => {
    await fetch("/api/blast/stop", { method: "POST" });
    onRefreshBlast();
  };

  const loadSampleNumbers = () => {
    onNumbersChange("081234567890|Budi Santoso\n6281987654321|Siti Aminah\n085611223344|Rudi");
  };

  const filteredItems = useMemo(() => {
    if (statusFilter === "all") return blastState.items;
    return blastState.items.filter((item) => item.status === statusFilter);
  }, [blastState.items, statusFilter]);

  const completedCount = blastState.sent + blastState.failed;
  const progressPct =
    blastState.total > 0 ? Math.round((completedCount / blastState.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Editor Pesan &amp; Daftar Nomor Blast
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              {parsedRecipients.length} nomor valid terdeteksi · Jeda anti-banned {minDelaySec}–{maxDelaySec} detik
            </p>
          </div>
          <button
            type="button"
            onClick={loadSampleNumbers}
            className="text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer whitespace-nowrap"
          >
            Isi Contoh Daftar Nomor
          </button>
        </div>

        {waState.status !== "connected" && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">WhatsApp belum terhubung.</span>{" "}
                <span>Scan QR Code terlebih dahulu sebelum menjalankan pengiriman massal.</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onGoToPairing}
              className="px-3 py-1.5 text-xs font-semibold text-amber-950 bg-amber-200 hover:bg-amber-300 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Buka QR Pairing
            </button>
          </div>
        )}

        {/* Import Kontak HP Toolbar */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="numbersInput"
              className="block text-xs font-medium text-slate-700"
            >
              Nomor Tujuan (format{" "}
              <span className="font-mono text-slate-900">0812xxx|Nama</span> atau impor dari HP)
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handlePickPhoneContacts}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                <Contact className="w-3.5 h-3.5 text-emerald-700" />
                <span>Pilih Kontak HP</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5 text-slate-700" />
                <span>Import .VCF / .CSV</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".vcf,.vcard,.csv,.txt"
                onChange={handleImportContactFile}
                className="hidden"
              />

              <button
                type="button"
                onClick={handleOpenWaContacts}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                <Users className="w-3.5 h-3.5 text-emerald-700" />
                <span>Kontak WhatsApp</span>
              </button>
            </div>
          </div>

          {contactNotice && (
            <div className="flex items-start justify-between gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700">
              <span>{contactNotice}</span>
              <button
                type="button"
                onClick={() => setContactNotice(null)}
                aria-label="Tutup pemberitahuan"
                className="text-slate-400 hover:text-slate-700 cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {showWaContacts && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900">
                  Kontak Tersinkron dari WhatsApp ({waContacts.length})
                </span>
                <button
                  type="button"
                  onClick={() => setShowWaContacts(false)}
                  className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Tutup
                </button>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={waContactQuery}
                  onChange={(e) => setWaContactQuery(e.target.value)}
                  placeholder="Cari nama atau nomor..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              {waContactsLoading ? (
                <div className="py-4 text-center text-xs text-slate-500">
                  Memuat daftar kontak WhatsApp...
                </div>
              ) : filteredWaContacts.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-500">
                  {waState.status === "connected"
                    ? "Belum ada kontak tersinkron. Kirim/terima pesan atau tunggu sinkronisasi awal selesai."
                    : "Hubungkan WhatsApp terlebih dahulu untuk membaca kontak dari akun Anda."}
                </div>
              ) : (
                <>
                  <div className="max-h-44 overflow-y-auto divide-y divide-slate-200 bg-white border border-slate-200 rounded-md">
                    {filteredWaContacts.map((c) => (
                      <label
                        key={c.number}
                        className="px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-slate-50 cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={selectedWaNumbers.has(c.number)}
                            onChange={() => toggleWaContact(c.number)}
                            className="accent-emerald-600"
                          />
                          <span className="font-medium text-slate-900 truncate">
                            {c.name}
                          </span>
                        </div>
                        <span className="font-mono tabular-nums text-slate-500 shrink-0">
                          {c.number}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={selectedWaNumbers.size === 0}
                      onClick={handleApplySelectedWaContacts}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-md transition-colors cursor-pointer"
                    >
                      Tambahkan {selectedWaNumbers.size} Kontak ke Blast
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <textarea
            id="numbersInput"
            rows={4}
            value={numbersText}
            onChange={(e) => onNumbersChange(e.target.value)}
            placeholder={"081234567890|Budi\n628567891234|Siti\n087811223344"}
            className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="blastMessageInput"
              className="block text-xs font-medium text-slate-700"
            >
              Isi Pesan Promosi (gunakan{" "}
              <span className="font-mono text-slate-900">{"{nama}"}</span> untuk sapaan otomatis)
            </label>
            <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
              <button
                type="button"
                onClick={() => setPreviewMode(false)}
                className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                  !previewMode ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"
                }`}
              >
                <Edit3 className="w-3 h-3" />
                <span>Editor</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode(true)}
                className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                  previewMode ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"
                }`}
              >
                <Eye className="w-3 h-3" />
                <span>Pratinjau</span>
              </button>
            </div>
          </div>

          {previewMode ? (
            <div className="min-h-[144px] p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 whitespace-pre-line">
              {previewText.trim() ? (
                previewText
              ) : (
                <span className="text-slate-400">
                  Belum ada isi pesan. Ketik pesan atau klik Generate AI Text di samping.
                </span>
              )}
            </div>
          ) : (
            <textarea
              id="blastMessageInput"
              rows={6}
              value={messageTemplate}
              onChange={(e) => onMessageChange(e.target.value)}
              placeholder="Halo {nama}, kami punya penawaran spesial untuk Anda..."
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3.5">
          <div>
            <label
              htmlFor="minDelay"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Jeda Minimum Anti-Banned (detik)
            </label>
            <input
              id="minDelay"
              type="number"
              min={2}
              max={60}
              value={minDelaySec}
              onChange={(e) => setMinDelaySec(Math.max(2, Number(e.target.value)))}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>
          <div>
            <label
              htmlFor="maxDelay"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Jeda Maksimum Anti-Banned (detik)
            </label>
            <input
              id="maxDelay"
              type="number"
              min={minDelaySec}
              max={120}
              value={maxDelaySec}
              onChange={(e) =>
                setMaxDelaySec(Math.max(minDelaySec, Number(e.target.value)))
              }
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <button
            type="button"
            onClick={handleStartBlast}
            disabled={blastState.running || submitting}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            {blastState.running || submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>
                  {blastState.delayCountdownSec > 0
                    ? `Menunggu Jeda (${blastState.delayCountdownSec}s)...`
                    : "Sedang Mengirim Blast..."}
                </span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Kirim Blast ({parsedRecipients.length} Nomor)</span>
              </>
            )}
          </button>

          {blastState.running && (
            <button
              type="button"
              onClick={handleStopBlast}
              className="inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Square className="w-4 h-4 text-red-600" />
              <span>Hentikan</span>
            </button>
          )}
        </div>
      </div>

      {/* Real-time Delivery Status */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Status Pengiriman Real-Time
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
              {blastState.sent} terkirim · {blastState.failed} gagal · {blastState.total} total target
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(["all", "sent", "failed", "queued"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  statusFilter === tab
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab === "all"
                  ? "Semua"
                  : tab === "sent"
                  ? "Terkirim"
                  : tab === "failed"
                  ? "Gagal"
                  : "Antrean"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-2 bg-emerald-600 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
            <span>Progres: {progressPct}%</span>
            <span>
              {blastState.running
                ? blastState.delayCountdownSec > 0
                  ? `Jeda aman anti-ban: ${blastState.delayCountdownSec} detik`
                  : `Mengirim ke ${blastState.currentTarget || "..."}`
                : blastState.finishedAt
                ? "Selesai"
                : "Siap dijalankan"}
            </span>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-slate-200 rounded-lg">
            <p className="text-sm text-slate-500">
              {blastState.items.length === 0
                ? "Belum ada riwayat pengiriman blast pada sesi ini."
                : "Tidak ada nomor pada filter status ini."}
            </p>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
              {filteredItems.map((item) => (
                <div
                  key={item.number}
                  className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-sm hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="font-mono tabular-nums text-xs sm:text-sm font-medium text-slate-900">
                      {item.number}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      Penerima: {item.name}
                      {item.error ? ` · ${item.error}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5 text-xs font-medium">
                    {item.status === "sent" && (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Terkirim</span>
                      </span>
                    )}
                    {item.status === "sending" && (
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Mengirim</span>
                      </span>
                    )}
                    {item.status === "failed" && (
                      <span className="inline-flex items-center gap-1 text-red-600">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Gagal</span>
                      </span>
                    )}
                    {item.status === "queued" && (
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Antrean</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
