import { QrCode, RefreshCw, LogOut, CheckCircle2, Smartphone, AlertCircle, Loader2 } from "lucide-react";
import type { WaState } from "../types";

interface WhatsAppPairingPanelProps {
  waState: WaState;
  onConnect: () => Promise<void>;
  onLogout: () => Promise<void>;
}

export function WhatsAppPairingPanel({
  waState,
  onConnect,
  onLogout,
}: WhatsAppPairingPanelProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Pairing WhatsApp Multi-Device
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Menggunakan protokol Baileys · QR Code juga dicetak otomatis di terminal server
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center min-h-[280px] bg-slate-50 border border-slate-200 rounded-xl p-6 text-center">
          {waState.status === "connected" && waState.user ? (
            <div className="space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
              <div>
                <div className="text-base font-semibold text-slate-900">
                  WhatsApp Aktif &amp; Terhubung
                </div>
                <div className="text-sm font-mono tabular-nums text-emerald-700 mt-1">
                  {waState.user.id.split(":")[0]}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Nama Profil: {waState.user.name}
                </div>
              </div>
            </div>
          ) : waState.status === "qr_ready" && waState.qrDataUrl ? (
            <div className="space-y-3">
              <img
                src={waState.qrDataUrl}
                alt="QR Code Pairing WhatsApp"
                className="w-56 h-56 mx-auto rounded-lg border border-slate-200 bg-white p-2"
              />
              <div className="text-xs text-slate-600">
                Scan QR di atas melalui WhatsApp HP Anda (berlaku ±40 detik sebelum refresh otomatis)
              </div>
            </div>
          ) : waState.status === "connecting" ? (
            <div className="space-y-3">
              <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mx-auto" />
              <div className="text-sm font-medium text-slate-700">
                Menghubungkan ke server WhatsApp...
              </div>
              <div className="text-xs text-slate-500">
                QR Code akan muncul sesaat lagi di sini dan di terminal.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <QrCode className="w-10 h-10 text-slate-400 mx-auto" />
              <div className="text-sm font-medium text-slate-700">
                Sesi WhatsApp belum terhubung
              </div>
              <div className="text-xs text-slate-500 max-w-xs">
                Klik tombol Hubungkan Ulang untuk memicu pembuatan QR Code baru.
              </div>
            </div>
          )}
        </div>

        {waState.lastError && (
          <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{waState.lastError}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onConnect}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className="w-4 h-4" />
            <span>{waState.status === "connected" ? "Cek / Segarkan Koneksi" : "Hubungkan / Muat QR"}</span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <LogOut className="w-4 h-4" />
            <span>Reset Sesi</span>
          </button>
        </div>
      </div>

      <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="pb-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-900">
            Panduan Tautkan Perangkat &amp; Tips Anti-Banned
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Praktik aman menjalankan kampanye WhatsApp Marketing
          </p>
        </div>

        <ol className="space-y-4 text-sm text-slate-700">
          <li className="flex items-start gap-3">
            <span className="font-mono text-xs font-semibold text-slate-500 mt-0.5">01.</span>
            <div>
              <div className="font-semibold text-slate-900">Buka Aplikasi WhatsApp di HP</div>
              <p className="text-xs text-slate-600 mt-0.5">
                Ketuk ikon menu titik tiga (Android) atau Pengaturan (iPhone), lalu pilih{" "}
                <span className="font-medium text-slate-800">Perangkat Tertaut (Linked Devices)</span>.
              </p>
            </div>
          </li>

          <li className="flex items-start gap-3">
            <span className="font-mono text-xs font-semibold text-slate-500 mt-0.5">02.</span>
            <div>
              <div className="font-semibold text-slate-900">Pindai QR Code Multi-Device</div>
              <p className="text-xs text-slate-600 mt-0.5">
                Ketuk <span className="font-medium text-slate-800">Tautkan Perangkat</span> dan arahkan kamera ke QR Code di sebelah kiri (atau QR Code yang tampil di terminal Node.js).
              </p>
            </div>
          </li>

          <li className="flex items-start gap-3">
            <span className="font-mono text-xs font-semibold text-slate-500 mt-0.5">03.</span>
            <div>
              <div className="font-semibold text-slate-900">Gunakan Jeda Acak &amp; Personalisasi</div>
              <p className="text-xs text-slate-600 mt-0.5">
                Pertahankan jeda minimal 3–5 detik antar pesan dan gunakan placeholder{" "}
                <span className="font-mono text-slate-900">{"{nama}"}</span> agar setiap pesan terasa personal dan aman dari deteksi spam.
              </p>
            </div>
          </li>
        </ol>

        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-3 text-xs text-slate-600">
          <Smartphone className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <span>
            Sesi tersimpan lokal di folder <span className="font-mono">auth_info_baileys/</span>. Jika menjalankan di GitHub Codespaces atau VPS, Anda cukup scan QR sekali dan sesi tetap aktif selama tidak di-logout dari HP.
          </span>
        </div>
      </div>
    </div>
  );
}
