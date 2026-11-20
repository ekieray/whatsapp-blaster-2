import { useEffect, useState } from "react";
import { Copy, Check, Download, Terminal, Loader2 } from "lucide-react";
import type { CodespaceFile } from "../types";

export function CodespacesExportPanel() {
  const [files, setFiles] = useState<CodespaceFile[]>([]);
  const [activeKey, setActiveKey] = useState<string>("package.json");
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/codespaces-files")
      .then((res) => res.json())
      .then((data) => {
        setFiles(data.files || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const activeFile = files.find((f) => f.key === activeKey) || files[0];

  const handleCopy = async (content: string, key: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Ignored
    }
  };

  const handleDownload = (file: CodespaceFile) => {
    const blob = new Blob([file.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.relPath.split("/").pop() || file.relPath;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Template 3 File Utama untuk GitHub Codespaces
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Struktur ringan (<span className="font-mono">package.json</span>,{" "}
              <span className="font-mono">index.js</span>,{" "}
              <span className="font-mono">public/index.html</span>) siap salin &amp; publish ke GitHub
            </p>
          </div>
        </div>

        <div className="p-4 bg-slate-900 text-slate-100 rounded-lg space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-400">
            <Terminal className="w-4 h-4" />
            <span>Perintah Terminal GitHub Codespaces / Lokal</span>
          </div>
          <pre className="text-xs font-mono leading-relaxed overflow-x-auto text-slate-200">
{`mkdir wa-blaster-ai && cd wa-blaster-ai && mkdir public
npm install
cp .env.example .env   # Isi GEMINI_API_KEY Anda
npm start`}
          </pre>
        </div>

        {loading ? (
          <div className="py-12 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Memuat berkas template...</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {files.map((file) => (
                <button
                  key={file.key}
                  type="button"
                  onClick={() => setActiveKey(file.key)}
                  className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    activeFile?.key === file.key
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {file.relPath}
                </button>
              ))}
            </div>

            {activeFile && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                  <span className="text-xs font-mono font-semibold text-slate-700">
                    {activeFile.relPath}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownload(activeFile)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Unduh</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(activeFile.content, activeFile.key)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {copiedKey === activeFile.key ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin Kode</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <pre className="p-4 text-xs font-mono leading-relaxed bg-white text-slate-800 max-h-[480px] overflow-auto">
                  <code>{activeFile.content}</code>
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
