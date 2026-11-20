import { useMemo, useState } from "react";
import {
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  ArrowRight,
  ShieldCheck,
  Link2,
  Copy,
  Check,
  AlertCircle,
} from "lucide-react";
import type { BusinessProfile, ChatSource, WaState } from "../types";

interface LeadFinderPanelProps {
  profile: BusinessProfile;
  waState: WaState;
  onAddNumbersToBlast: (lines: string[]) => void;
  onGoToPairing: () => void;
}

interface CheckedNumberResult {
  number: string;
  name: string;
  exists: boolean;
}

export function LeadFinderPanel({
  profile,
  waState,
  onAddNumbersToBlast,
  onGoToPairing,
}: LeadFinderPanelProps) {
  // 1. Public Business Lead Search (Gemini + Google Search Grounding)
  const [targetKeyword, setTargetKeyword] = useState(
    profile.targetAudience.split(",")[0]?.trim() || "Kedai Kopi"
  );
  const [location, setLocation] = useState("Jakarta");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<{
    summary: string;
    extractedNumbers: string[];
    sources: ChatSource[];
  } | null>(null);

  // 2. Baileys Active WhatsApp Number Verifier
  const [candidateText, setCandidateText] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checkResults, setCheckResults] = useState<CheckedNumberResult[]>([]);

  // 3. Opt-in wa.me Link Generator for Individual Consumers
  const [myWaNumber, setMyWaNumber] = useState("");
  const [optInGreeting, setOptInGreeting] = useState(
    `Halo, saya tertarik dengan promo ${profile.businessName || "usaha Anda"}. Boleh minta info lengkapnya?`
  );
  const [copiedLink, setCopiedLink] = useState(false);

  const handleSearchLeads = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetKeyword.trim() || searching) return;

    setSearching(true);
    setSearchError(null);

    try {
      const res = await fetch("/api/leads/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetKeyword,
          location,
          businessProfile: profile,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal mencari leads target.");
      }
      setSearchResult(data);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Terjadi kesalahan jaringan.");
    } finally {
      setSearching(false);
    }
  };

  const moveExtractedToVerifier = () => {
    if (!searchResult?.extractedNumbers.length) return;
    const existing = candidateText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const merged = Array.from(new Set([...existing, ...searchResult.extractedNumbers]));
    setCandidateText(merged.join("\n"));
  };

  const handleCheckWhatsApp = async () => {
    if (!candidateText.trim() || checking) return;
    setChecking(true);
    setCheckError(null);

    try {
      const res = await fetch("/api/wa/check-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numbersText: candidateText }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal memverifikasi nomor WhatsApp.");
      }
      setCheckResults(data.results || []);
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "Terjadi kesalahan jaringan.");
    } finally {
      setChecking(false);
    }
  };

  const activeChecked = useMemo(
    () => checkResults.filter((r) => r.exists),
    [checkResults]
  );

  const handlePushActiveToBlast = () => {
    const lines = activeChecked.map((item) => `${item.number}|${item.name}`);
    onAddNumbersToBlast(lines);
  };

  const normalizedMyWa = useMemo(() => {
    const d = myWaNumber.replace(/\D/g, "");
    if (!d) return "";
    if (d.startsWith("0")) return "62" + d.slice(1);
    if (d.startsWith("8")) return "62" + d;
    return d;
  }, [myWaNumber]);

  const waMeUrl = useMemo(() => {
    if (!normalizedMyWa) return "";
    return `https://wa.me/${normalizedMyWa}?text=${encodeURIComponent(optInGreeting)}`;
  }, [normalizedMyWa, optInGreeting]);

  const handleCopyWaLink = async () => {
    if (!waMeUrl) return;
    try {
      await navigator.clipboard.writeText(waMeUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      // Ignored
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Kiri: Pencarian Target Bisnis Publik via Google Search */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="pb-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900">
              Pencari Target Bisnis &amp; Mitra (B2B)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Menelusuri daftar usaha publik yang sesuai target melalui Google Search (hanya kontak usaha publik, bukan nomor pribadi)
            </p>
          </div>

          <form onSubmit={handleSearchLeads} className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="targetKeyword"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Kategori / Target Usaha
                </label>
                <input
                  id="targetKeyword"
                  type="text"
                  value={targetKeyword}
                  onChange={(e) => setTargetKeyword(e.target.value)}
                  placeholder="Contoh: Klinik Gigi, Toko Kue, Cafe"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label
                  htmlFor="targetLocation"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Kota / Area Target
                </label>
                <input
                  id="targetLocation"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Contoh: Bandung, Surabaya, Medan"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={searching}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
            >
              {searching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Mencari Leads Target di Web...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Cari Calon Konsumen Bisnis</span>
                </>
              )}
            </button>
          </form>

          {searchError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{searchError}</span>
            </div>
          )}

          {searchResult && (
            <div className="pt-3 border-t border-slate-100 space-y-4">
              {searchResult.extractedNumbers.length > 0 && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-emerald-900 tabular-nums">
                      {searchResult.extractedNumbers.length} Nomor Kontak Publik Ditemukan
                    </span>
                    <button
                      type="button"
                      onClick={moveExtractedToVerifier}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors cursor-pointer"
                    >
                      <span>Salin ke Verifikator WA</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-xs font-mono tabular-nums text-emerald-950">
                    {searchResult.extractedNumbers.join(", ")}
                  </div>
                </div>
              )}

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg max-h-80 overflow-y-auto text-xs leading-relaxed text-slate-700 whitespace-pre-line">
                {searchResult.summary}
              </div>

              {searchResult.sources.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-slate-500">
                    Sumber Direktori &amp; Situs Web
                  </div>
                  <div className="space-y-1">
                    {searchResult.sources.map((src) => (
                      <a
                        key={src.uri}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-emerald-700 hover:underline truncate"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span className="truncate">{src.title}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Kanan: Verifikator Nomor WhatsApp Aktif (Baileys) + Link Opt-In Konsumen Individu */}
        <section className="lg:col-span-6 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Verifikator Nomor WhatsApp Aktif
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pastikan nomor calon konsumen benar-benar terdaftar di WhatsApp sebelum di-blast
                </p>
              </div>
              {waState.status !== "connected" && (
                <button
                  type="button"
                  onClick={onGoToPairing}
                  className="px-2.5 py-1 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors cursor-pointer"
                >
                  Hubungkan WA Dulu
                </button>
              )}
            </div>

            <div>
              <label
                htmlFor="candidateNumbers"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Daftar Kandidat Nomor (maks. 100 nomor, format <span className="font-mono">0812xxx|Nama</span>)
              </label>
              <textarea
                id="candidateNumbers"
                rows={4}
                value={candidateText}
                onChange={(e) => setCandidateText(e.target.value)}
                placeholder={"081234567890|Kafe Senja\n081122334455|Klinik Sehat"}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            {checkError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {checkError}
              </div>
            )}

            <button
              type="button"
              onClick={handleCheckWhatsApp}
              disabled={checking || !candidateText.trim()}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
            >
              {checking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memeriksa ke Server WhatsApp...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Cek Nomor WhatsApp Aktif</span>
                </>
              )}
            </button>

            {checkResults.length > 0 && (
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-600 font-mono tabular-nums">
                    {activeChecked.length} aktif · {checkResults.length - activeChecked.length} tidak terdaftar
                  </span>
                  {activeChecked.length > 0 && (
                    <button
                      type="button"
                      onClick={handlePushActiveToBlast}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
                    >
                      <span>Masukkan {activeChecked.length} Nomor Aktif ke Blast</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-56 overflow-y-auto">
                  {checkResults.map((item) => (
                    <div
                      key={item.number}
                      className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-mono tabular-nums font-medium text-slate-900">
                          {item.number}
                        </span>{" "}
                        <span className="text-slate-500">· {item.name}</span>
                      </div>
                      {item.exists ? (
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-700 shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Aktif di WA</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-medium text-red-600 shrink-0">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Bukan WA</span>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Generator Link Opt-In untuk Target Konsumen Individu */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3.5">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Link Opt-In Konsumen Perorangan (Inbound Leads)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Pasang tautan ini di bio Instagram, TikTok, atau iklan agar calon konsumen perorangan menghubungi Anda terlebih dahulu (otomatis disambut Auto-Responder AI)
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="myWaNumber"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Nomor WhatsApp Bisnis Anda
                </label>
                <input
                  id="myWaNumber"
                  type="text"
                  value={myWaNumber}
                  onChange={(e) => setMyWaNumber(e.target.value)}
                  placeholder="081234567890"
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label
                  htmlFor="optInGreeting"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Teks Pembuka Otomatis
                </label>
                <input
                  id="optInGreeting"
                  type="text"
                  value={optInGreeting}
                  onChange={(e) => setOptInGreeting(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            {waMeUrl && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 text-xs font-mono text-slate-700">
                  <Link2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span className="truncate">{waMeUrl}</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyWaLink}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md shrink-0 cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Disalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin Link</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
