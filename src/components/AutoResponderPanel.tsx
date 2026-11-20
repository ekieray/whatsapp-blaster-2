import { useState } from "react";
import { Bot, Send, Loader2, Check, MessageSquareText } from "lucide-react";
import type { AutoReplyLog, BusinessProfile } from "../types";

interface AutoResponderPanelProps {
  enabled: boolean;
  onToggleEnabled: (next: boolean) => Promise<void>;
  profile: BusinessProfile;
  onChangeProfile: (updated: BusinessProfile) => void;
  onSaveConfig: () => Promise<void>;
  logs: AutoReplyLog[];
  onLogAdded: (log: AutoReplyLog) => void;
}

export function AutoResponderPanel({
  enabled,
  onToggleEnabled,
  profile,
  onChangeProfile,
  onSaveConfig,
  logs,
  onLogAdded,
}: AutoResponderPanelProps) {
  const [saving, setSaving] = useState(false);
  const [savedFlag, setSavedFlag] = useState(false);
  const [testSender, setTestSender] = useState("Andi");
  const [testMessage, setTestMessage] = useState(
    "Halo kak, mau tanya promo yang masih berlaku hari ini apa ya dan ongkirnya berapa?"
  );
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveConfig();
      setSavedFlag(true);
      setTimeout(() => setSavedFlag(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleTestReply = async () => {
    setTesting(true);
    setTestError(null);
    try {
      const res = await fetch("/api/autoresponder/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: testMessage,
          senderName: testSender,
          profileOverride: profile,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal menguji balasan AI.");
      }
      if (data.log) {
        onLogAdded(data.log);
      }
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Kesalahan jaringan.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5 space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Pengaturan Auto-Responder AI
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Membalas pesan pribadi yang masuk ke WhatsApp secara otomatis via Gemini AI
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => onToggleEnabled(!enabled)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                enabled
                  ? "bg-emerald-600 border-emerald-600 text-white"
                  : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {enabled ? "Auto-Reply: Aktif" : "Auto-Reply: Nonaktif"}
            </button>
          </div>

          <div className="space-y-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-1">
              <div className="font-semibold text-slate-800">
                Basis Pengetahuan Aktif: {profile.businessName || "Belum diisi"}
              </div>
              <div>Produk: {profile.productType || "-"}</div>
              <div>Promo: {profile.promoType || "-"}</div>
            </div>

            <div>
              <label
                htmlFor="faqNotes"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Catatan Operasional, Harga &amp; FAQ Tambahan
              </label>
              <textarea
                id="faqNotes"
                rows={4}
                value={profile.faqNotes}
                onChange={(e) =>
                  onChangeProfile({ ...profile, faqNotes: e.target.value })
                }
                placeholder="Jam buka, cara pemesanan, nomor rekening / link toko, garansi, dll."
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : savedFlag ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Bot className="w-4 h-4" />
              )}
              <span>{savedFlag ? "Konfigurasi Tersimpan" : "Simpan Basis Pengetahuan"}</span>
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3.5">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Simulasi Uji Balasan AI
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Uji kecerdasan balasan AI terhadap pertanyaan calon pelanggan sebelum diaktifkan
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label
                htmlFor="testSender"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Nama Simulasi Pelanggan
              </label>
              <input
                id="testSender"
                type="text"
                value={testSender}
                onChange={(e) => setTestSender(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label
                htmlFor="testMessage"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Pesan Pertanyaan Masuk
              </label>
              <textarea
                id="testMessage"
                rows={3}
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            {testError && (
              <p className="text-xs text-red-600">{testError}</p>
            )}

            <button
              type="button"
              onClick={handleTestReply}
              disabled={testing}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
            >
              {testing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memproses Balasan...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Uji Balasan Sekarang</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Riwayat Aktivitas Auto-Responder
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              {logs.length} interaksi tercatat pada sesi ini
            </p>
          </div>
        </div>

        {logs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
            <MessageSquareText className="w-8 h-8 text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-700">
              Belum ada balasan otomatis tercatat
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Gunakan panel Simulasi Uji Balasan di samping atau aktifkan Auto-Reply saat WhatsApp terhubung.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[620px] overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id} className="py-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-medium text-slate-800">
                    {log.senderName} · <span className="font-mono">{log.sender}</span>
                  </span>
                  <span className="font-mono tabular-nums">
                    {log.source === "simulation" ? "Simulasi" : "WhatsApp"} ·{" "}
                    {new Date(log.timestamp).toLocaleTimeString("id-ID")}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700">
                  <span className="font-semibold text-slate-900">Masuk: </span>
                  {log.incoming}
                </div>

                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs text-slate-800 whitespace-pre-line">
                  <span className="font-semibold text-emerald-800">Balasan AI: </span>
                  {log.reply}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
