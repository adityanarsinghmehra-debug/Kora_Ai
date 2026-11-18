import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Upload, X } from 'lucide-react';

interface BackupModalProps {
  mode: 'export' | 'import' | null;
  initialJson: string;
  onClose: () => void;
  onRestoreJson: (jsonText: string) => Promise<void> | void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  mode,
  initialJson,
  onClose,
  onRestoreJson,
}) => {
  const [textValue, setTextValue] = useState(initialJson);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTextValue(initialJson);
    setErrorMsg(null);
    setCopied(false);
  }, [initialJson, mode]);

  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, onClose]);

  if (!mode) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setErrorMsg('Clipboard access was blocked; select the text manually to copy.');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([textValue], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kora-ai-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setTextValue(String(reader.result || ''));
      setErrorMsg(null);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleRestore = async () => {
    try {
      await onRestoreJson(textValue);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid JSON backup payload.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="backup-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 high-contrast:bg-black border border-slate-200 dark:border-slate-800 high-contrast:border-yellow-400 p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="backup-modal-title" className="text-base font-semibold text-slate-900 dark:text-white high-contrast:text-yellow-300">
            {mode === 'export' ? 'Export Workspace Backup (JSON)' : 'Import Workspace Backup (JSON)'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close backup modal"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 high-contrast:text-white">
          {mode === 'export'
            ? 'Download or copy this JSON to back up your conversations, personalized memories, and preferences.'
            : 'Choose a backup .json file or paste exported JSON below to restore chats and memories.'}
        </p>

        <textarea
          rows={9}
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          aria-label="Backup JSON content"
          placeholder={mode === 'import' ? 'Paste exported JSON here...' : ''}
          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 high-contrast:border-white bg-slate-950 text-emerald-300 font-mono text-xs p-3.5"
        />

        {errorMsg && (
          <p role="alert" className="text-xs text-rose-600 dark:text-rose-400 high-contrast:text-yellow-300">
            {errorMsg}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {mode === 'export' ? (
            <>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-500" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
                <span>{copied ? 'Copied' : 'Copy JSON'}</span>
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-sky-500 high-contrast:bg-yellow-400 high-contrast:text-black text-white dark:text-slate-950 text-sm font-semibold hover:opacity-90"
              >
                <Download className="w-4 h-4" aria-hidden="true" />
                <span>Download File</span>
              </button>
            </>
          ) : (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Upload className="w-4 h-4" aria-hidden="true" />
                <span>Select File</span>
              </button>
              <button
                type="button"
                onClick={() => void handleRestore()}
                className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 high-contrast:bg-yellow-400 high-contrast:text-black text-white text-sm font-semibold"
              >
                <span>Restore Backup</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
