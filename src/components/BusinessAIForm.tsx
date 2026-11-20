import { useState } from "react";
import { Sparkles, Copy, Check, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import type { BusinessProfile, CopyVariation } from "../types";

interface BusinessAIFormProps {
  profile: BusinessProfile;
  onChange: (updated: BusinessProfile) => void;
  onApplyMessage: (message: string) => void;
}

const BUSINESS_PRESETS: Array<{ label: string; data: Partial<BusinessProfile> }> = [
  {
    label: "Kopi & F&B",
    data: {
      businessName: "Kopi Senja Nusantara",
      productType: "Kopi Arabika & Minuman Kemasan 1 Liter",
      description: "Biji kopi pilihan single origin, fresh roast setiap minggu, tersedia kopi susu gula aren.",
      targetAudience: "Pekerja kantoran, mahasiswa, penikmat kopi harian",
      promoType: "Diskon 20% pembelian pertama + Gratis Ongkir",
      tone: "Ramah & Santai",
    },
  },
  {
    label: "Fashion Retail",
    data: {
      businessName: "Alinea Studio",
      productType: "Kemeja Linen & Outerwear Kasual",
      description: "Bahan linen premium adem, jahitan rapi, tersedia ukuran S hingga XXL.",
      targetAudience: "Dewasa muda usia 22-38 tahun",
      promoType: "Beli 2 Gratis 1 khusus akhir pekan",
      tone: "Elegan & Eksklusif",
    },
  },
  {
    label: "Jasa & Klinik",
    data: {
      businessName: "Klinik Gigi Harmoni",
      productType: "Scaling Gigi, Bleaching & Konsultasi Ortodonti",
      description: "Ditangani dokter gigi berpengalaman dengan peralatan steril dan ruang nyaman.",
      targetAudience: "Keluarga dan profesional di area kota",
      promoType: "Voucher Scaling Rp199.000 + Gratis Konsultasi",
      tone: "Profesional & Terpercaya",
    },
  },
];

export function BusinessAIForm({
  profile,
  onChange,
  onApplyMessage,
}: BusinessAIFormProps) {
  const [variations, setVariations] = useState<CopyVariation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const updateField = (key: keyof BusinessProfile, value: string) => {
    onChange({ ...profile, [key]: value });
  };

  const applyPreset = (preset: Partial<BusinessProfile>) => {
    onChange({ ...profile, ...preset });
    setError(null);
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/copywriting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal membuat teks promosi AI.");
      }
      setVariations(data.variations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan jaringan.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1800);
    } catch {
      // Fallback ignored
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Profil Bisnis &amp; AI Copywriting
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Universal untuk segala jenis usaha · Otomatis tersinkron ke Auto-Responder
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {BUSINESS_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset.data)}
              className="px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-white hover:text-slate-900 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label
              htmlFor="businessName"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Nama Usaha
            </label>
            <input
              id="businessName"
              type="text"
              value={profile.businessName}
              onChange={(e) => updateField("businessName", e.target.value)}
              placeholder="Contoh: Kopi Senja Nusantara"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
            />
          </div>

          <div>
            <label
              htmlFor="productType"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Jenis Produk / Jasa
            </label>
            <input
              id="productType"
              type="text"
              value={profile.productType}
              onChange={(e) => updateField("productType", e.target.value)}
              placeholder="Contoh: Paket Skincare / Jasa Desain"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="description"
            className="block text-xs font-medium text-slate-700 mb-1.5"
          >
            Deskripsi &amp; Keunggulan Produk
          </label>
          <textarea
            id="description"
            rows={2}
            value={profile.description}
            onChange={(e) => updateField("description", e.target.value)}
            placeholder="Jelaskan nilai jual utama, kualitas, atau manfaat produk Anda..."
            className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent resize-y"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label
              htmlFor="targetAudience"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Target Konsumen
            </label>
            <input
              id="targetAudience"
              type="text"
              value={profile.targetAudience}
              onChange={(e) => updateField("targetAudience", e.target.value)}
              placeholder="Ibu rumah tangga, pekerja, UMKM..."
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
            />
          </div>

          <div>
            <label
              htmlFor="promoType"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Jenis Promo / Penawaran
            </label>
            <input
              id="promoType"
              type="text"
              value={profile.promoType}
              onChange={(e) => updateField("promoType", e.target.value)}
              placeholder="Diskon 25%, Buy 1 Get 1, Gratis Ongkir"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label
              htmlFor="tone"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Gaya Bahasa (Tone)
            </label>
            <select
              id="tone"
              value={profile.tone}
              onChange={(e) => updateField("tone", e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
            >
              <option value="Ramah & Santai">Ramah &amp; Santai</option>
              <option value="Profesional & Terpercaya">Profesional &amp; Terpercaya</option>
              <option value="Persuasif & Mendesak (FOMO)">Persuasif &amp; Mendesak (FOMO)</option>
              <option value="Elegan & Eksklusif">Elegan &amp; Eksklusif</option>
              <option value="Akrab & Lokal Indonesia">Akrab &amp; Lokal Indonesia</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="customPrompt"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Instruksi Prompt Tambahan
            </label>
            <input
              id="customPrompt"
              type="text"
              value={profile.customPrompt}
              onChange={(e) => updateField("customPrompt", e.target.value)}
              placeholder="Misal: Akhiri dengan ajakan balas MAU"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Menyusun 3 Variasi Copywriting...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Generate AI Text</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {variations.length > 0 && (
        <div className="pt-2 space-y-3 border-t border-slate-100">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Hasil Copywriting Gemini AI</span>
            <span className="tabular-nums">{variations.length} variasi siap pakai</span>
          </div>

          <div className="space-y-3">
            {variations.map((item, idx) => (
              <div
                key={`${item.title}-${idx}`}
                className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {item.title}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {item.angle}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(item.message, idx)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {copiedIdx === idx ? (
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
                      onClick={() => onApplyMessage(item.message)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <span>Gunakan</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-slate-700 whitespace-pre-line">
                  {item.message}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
