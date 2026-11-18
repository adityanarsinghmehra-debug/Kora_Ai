import React from 'react';
import { Download, Upload } from 'lucide-react';

interface GuideViewProps {
  onExportBackup: () => void;
  onOpenImport: () => void;
}

export const GuideView: React.FC<GuideViewProps> = ({ onExportBackup, onOpenImport }) => {
  const sections = [
    {
      num: '01',
      title: 'Real-Time Gemini Voice',
      body: 'Live Voice streams 16 kHz microphone audio over a WebSocket to Gemini Live and schedules 24 kHz audio responses with low-latency barge-in. Speak naturally, interrupt mid-sentence, and read live transcripts.',
    },
    {
      num: '02',
      title: 'Personalized Cloud Memory',
      body: 'Preferences, goals, and personal facts are stored per account in Cloud Firestore (with local offline caching) and injected into both text and voice system instructions when Cross-Chat Memory is enabled.',
    },
    {
      num: '03',
      title: 'System Instructions & Personas',
      body: 'The System Instruction acts as Kora’s core rulebook across turns. Switch presets between Balanced Assistant, Coding Tutor, or Fact-Checker, or write custom rules tailored to your workflow.',
    },
    {
      num: '04',
      title: 'Installable PWA & Offline Access',
      body: 'Install Kora AI on iOS, Android, macOS, or Windows for standalone app launch. When offline, cached chats, saved memories, math calculation, and core AI topics remain immediately accessible.',
    },
    {
      num: '05',
      title: 'High Accessibility Standards',
      body: 'Designed for WCAG AA/AAA compliance with 44px touch targets, ARIA live regions for streaming text and voice captions, keyboard navigation, High-Contrast mode, Large text sizing, and optional read-aloud speech.',
    },
    {
      num: '06',
      title: 'Portable JSON Backups',
      body: 'You own your conversation history and memories. Export your entire workspace as portable JSON anytime or restore a backup file across devices.',
    },
  ];

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 high-contrast:border-yellow-400 bg-white dark:bg-slate-900 high-contrast:bg-black p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white high-contrast:text-yellow-300">
            Backup &amp; Restore Workspace
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 high-contrast:text-white mt-0.5">
            Export or import all saved conversations, personalized memories, and preferences as JSON.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={onExportBackup}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-sky-500 dark:hover:bg-sky-400 high-contrast:bg-yellow-400 high-contrast:text-black text-white dark:text-slate-950 text-sm font-semibold transition-colors"
          >
            <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Export JSON</span>
          </button>
          <button
            type="button"
            onClick={onOpenImport}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 high-contrast:border-white text-sm font-semibold text-slate-800 dark:text-slate-200 high-contrast:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Upload className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Import JSON</span>
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 high-contrast:border-yellow-400 bg-white dark:bg-slate-900 high-contrast:bg-black p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white high-contrast:text-yellow-300">
            How Kora AI Works
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 high-contrast:text-white mt-0.5">
            Architecture, memory persistence, voice streaming, and accessibility design.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6 pt-2 border-t border-slate-100 dark:border-slate-800">
          {sections.map((item) => (
            <article key={item.num} className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white high-contrast:text-yellow-300">
                <span className="font-mono text-sky-600 dark:text-sky-400 high-contrast:text-yellow-300 mr-2">
                  {item.num}.
                </span>
                {item.title}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 high-contrast:text-white leading-relaxed">
                {item.body}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
