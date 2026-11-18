import React, { useEffect } from 'react';
import { Eye, Keyboard, Volume2, X } from 'lucide-react';
import { type FontSizeMode, type ThemeMode, type UserProfile, VOICE_OPTIONS, type VoiceName } from '../types/chat';

interface AccessibilityModalProps {
  isOpen: boolean;
  profile: UserProfile;
  onClose: () => void;
  onUpdateProfile: (next: UserProfile) => void;
}

export const AccessibilityModal: React.FC<AccessibilityModalProps> = ({
  isOpen,
  profile,
  onClose,
  onUpdateProfile,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const themes: { value: ThemeMode; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'high-contrast', label: 'High Contrast (AAA)' },
  ];

  const fontSizes: { value: FontSizeMode; label: string }[] = [
    { value: 'normal', label: 'Standard (16px)' },
    { value: 'large', label: 'Large (18px)' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="a11y-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 high-contrast:bg-black border border-slate-200 dark:border-slate-800 high-contrast:border-yellow-400 p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Eye className="w-5 h-5 text-sky-600 dark:text-sky-400 high-contrast:text-yellow-300" aria-hidden="true" />
            <h2 id="a11y-modal-title" className="text-lg font-semibold text-slate-900 dark:text-white high-contrast:text-yellow-300">
              Accessibility &amp; Display
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close accessibility preferences"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Contrast Theme */}
        <div className="space-y-2">
          <span className="block text-sm font-medium text-slate-800 dark:text-slate-200 high-contrast:text-white">
            Color Theme
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {themes.map((t) => (
              <button
                key={t.value}
                type="button"
                aria-pressed={profile.theme === t.value}
                onClick={() => onUpdateProfile({ ...profile, theme: t.value })}
                className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                  profile.theme === t.value
                    ? 'border-sky-600 bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-200 high-contrast:bg-yellow-400 high-contrast:text-black high-contrast:border-yellow-400'
                    : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 high-contrast:border-white high-contrast:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Reading Text Size */}
        <div className="space-y-2">
          <span className="block text-sm font-medium text-slate-800 dark:text-slate-200 high-contrast:text-white">
            Message Text Size
          </span>
          <div className="grid grid-cols-2 gap-2">
            {fontSizes.map((fs) => (
              <button
                key={fs.value}
                type="button"
                aria-pressed={profile.fontSize === fs.value}
                onClick={() => onUpdateProfile({ ...profile, fontSize: fs.value })}
                className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                  profile.fontSize === fs.value
                    ? 'border-sky-600 bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-200 high-contrast:bg-yellow-400 high-contrast:text-black high-contrast:border-yellow-400'
                    : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 high-contrast:border-white high-contrast:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {fs.label}
              </button>
            ))}
          </div>
        </div>

        {/* Speech & Read-Aloud */}
        <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <label className="flex items-center justify-between gap-4 min-h-[44px] cursor-pointer">
            <span className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200 high-contrast:text-white">
              <Volume2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Automatically read AI replies aloud</span>
            </span>
            <input
              type="checkbox"
              checked={profile.autoReadResponses}
              onChange={(e) =>
                onUpdateProfile({ ...profile, autoReadResponses: e.target.checked })
              }
              className="w-5 h-5 rounded border-slate-400 accent-sky-600"
            />
          </label>

          <div className="space-y-1.5">
            <label
              htmlFor="a11y-voice-select"
              className="block text-sm font-medium text-slate-800 dark:text-slate-200 high-contrast:text-white"
            >
              Assistant Voice
            </label>
            <select
              id="a11y-voice-select"
              value={profile.voiceName}
              onChange={(e) =>
                onUpdateProfile({ ...profile, voiceName: e.target.value as VoiceName })
              }
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 high-contrast:border-white bg-slate-50 dark:bg-slate-800 high-contrast:bg-black px-3 text-sm text-slate-900 dark:text-slate-100 high-contrast:text-white"
            >
              {VOICE_OPTIONS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label} — {v.tone}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Keyboard Shortcuts */}
        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200 high-contrast:text-yellow-300">
            <Keyboard className="w-4 h-4" aria-hidden="true" />
            <span>Keyboard Shortcuts</span>
          </div>
          <dl className="grid grid-cols-2 gap-y-1.5 text-xs text-slate-600 dark:text-slate-300 high-contrast:text-white">
            <dt className="font-mono">Enter</dt>
            <dd>Send message</dd>
            <dt className="font-mono">Shift + Enter</dt>
            <dd>Insert new line</dd>
            <dt className="font-mono">Alt + V</dt>
            <dd>Start or stop live voice</dd>
            <dt className="font-mono">Esc</dt>
            <dd>Close active dialog or drawer</dd>
          </dl>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[44px] rounded-xl bg-slate-900 dark:bg-sky-500 high-contrast:bg-yellow-400 text-white dark:text-slate-950 high-contrast:text-black text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Done
        </button>
      </div>
    </div>
  );
};
