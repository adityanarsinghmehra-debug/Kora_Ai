import React from 'react';
import { Mic, MicOff, PhoneOff, Radio, Volume2, VolumeX } from 'lucide-react';
import { type VoiceSessionState } from '../hooks/useLiveVoice';
import { VOICE_OPTIONS, type VoiceName } from '../types/chat';

interface VoiceStageProps {
  voiceState: VoiceSessionState;
  isMuted: boolean;
  voiceName: VoiceName;
  errorMessage: string | null;
  liveUserTranscript: string;
  liveModelTranscript: string;
  inputLevel: number;
  outputLevel: number;
  isOnline: boolean;
  onSelectVoice: (voice: VoiceName) => void;
  onStart: () => void;
  onStop: () => void;
  onToggleMute: () => void;
  onInterrupt: () => void;
  compact?: boolean;
}

const BAR_WEIGHTS = [0.35, 0.55, 0.8, 1.0, 0.9, 0.7, 0.95, 0.75, 0.5, 0.4];

export const VoiceStage: React.FC<VoiceStageProps> = ({
  voiceState,
  isMuted,
  voiceName,
  errorMessage,
  liveUserTranscript,
  liveModelTranscript,
  inputLevel,
  outputLevel,
  isOnline,
  onSelectVoice,
  onStart,
  onStop,
  onToggleMute,
  onInterrupt,
  compact = false,
}) => {
  const isActive = voiceState === 'listening' || voiceState === 'speaking' || voiceState === 'connecting';
  const activeEnergy = voiceState === 'speaking' ? outputLevel : isMuted ? 0 : inputLevel;

  const statusLabel = (() => {
    if (!isOnline) return 'Offline — Connect to internet for live voice';
    if (voiceState === 'connecting') return 'Connecting real-time audio session...';
    if (voiceState === 'speaking') return 'Kora is speaking (speak or tap Interrupt anytime)';
    if (voiceState === 'listening') return isMuted ? 'Microphone muted' : 'Listening — Speak naturally';
    if (voiceState === 'error') return 'Voice connection interrupted';
    return 'Ready for real-time voice conversation';
  })();

  return (
    <section
      aria-label="Real-time voice interaction"
      className={`rounded-2xl border border-slate-200 dark:border-slate-800 high-contrast:border-yellow-400 bg-white dark:bg-slate-900 high-contrast:bg-black ${
        compact ? 'p-4' : 'p-6 sm:p-8'
      } space-y-5`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Radio
              className={`w-5 h-5 shrink-0 ${
                voiceState === 'speaking'
                  ? 'text-sky-600 dark:text-sky-400 high-contrast:text-yellow-300'
                  : voiceState === 'listening'
                  ? 'text-emerald-600 dark:text-emerald-400 high-contrast:text-yellow-300'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
              aria-hidden="true"
            />
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white high-contrast:text-yellow-300">
              Live Voice Studio
            </h2>
          </div>
          <p
            role="status"
            aria-live="polite"
            className="text-sm text-slate-600 dark:text-slate-300 high-contrast:text-white"
          >
            {statusLabel}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor={compact ? 'voice-select-compact' : 'voice-select-full'}
            className="text-xs font-medium text-slate-600 dark:text-slate-300 high-contrast:text-white whitespace-nowrap"
          >
            Voice
          </label>
          <select
            id={compact ? 'voice-select-compact' : 'voice-select-full'}
            value={voiceName}
            disabled={isActive}
            onChange={(e) => onSelectVoice(e.target.value as VoiceName)}
            className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 high-contrast:border-yellow-400 bg-slate-50 dark:bg-slate-800 high-contrast:bg-black px-3 text-sm font-medium text-slate-900 dark:text-slate-100 high-contrast:text-white disabled:opacity-60"
          >
            {VOICE_OPTIONS.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label} ({v.tone})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Real-time Audio Visualizer */}
      <div
        aria-hidden="true"
        className={`flex items-center justify-center gap-2 rounded-2xl bg-slate-50 dark:bg-slate-950 high-contrast:bg-black border border-slate-200 dark:border-slate-800 high-contrast:border-slate-700 ${
          compact ? 'h-20' : 'h-32'
        } px-6`}
      >
        {BAR_WEIGHTS.map((weight, idx) => {
          const base = isActive ? 0.18 : 0.1;
          const level = Math.min(1, base + activeEnergy * weight * 0.9);
          const heightPct = Math.round(level * 100);
          return (
            <div
              key={idx}
              style={{ height: `${heightPct}%` }}
              className={`w-2.5 sm:w-3 rounded-full transition-[height,background-color] duration-100 ${
                voiceState === 'speaking'
                  ? 'bg-sky-600 dark:bg-sky-400 high-contrast:bg-yellow-400'
                  : voiceState === 'listening' && !isMuted
                  ? 'bg-emerald-600 dark:bg-emerald-400 high-contrast:bg-yellow-300'
                  : 'bg-slate-300 dark:bg-slate-700 high-contrast:bg-slate-600'
              }`}
            />
          );
        })}
      </div>

      {/* Live Accessible Captions */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="rounded-xl bg-slate-50 dark:bg-slate-950 high-contrast:bg-black border border-slate-200 dark:border-slate-800 high-contrast:border-white p-4 space-y-2 min-h-[84px]"
      >
        {liveUserTranscript || liveModelTranscript ? (
          <>
            {liveUserTranscript && (
              <p className="text-sm text-slate-700 dark:text-slate-200 high-contrast:text-white">
                <span className="font-semibold text-slate-900 dark:text-white high-contrast:text-yellow-300">
                  You:{' '}
                </span>
                {liveUserTranscript}
              </p>
            )}
            {liveModelTranscript && (
              <p className="text-sm text-sky-900 dark:text-sky-200 high-contrast:text-yellow-200">
                <span className="font-semibold text-sky-700 dark:text-sky-400 high-contrast:text-yellow-300">
                  Kora:{' '}
                </span>
                {liveModelTranscript}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400 high-contrast:text-slate-200">
            Live voice captions appear here automatically during your session and are saved to your conversation history.
          </p>
        )}
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 high-contrast:bg-black high-contrast:border-yellow-400 px-4 py-3 text-sm text-rose-800 dark:text-rose-200 high-contrast:text-yellow-300"
        >
          {errorMessage}
        </div>
      )}

      {/* Voice Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {!isActive ? (
          <button
            type="button"
            disabled={!isOnline}
            onClick={onStart}
            className="inline-flex items-center justify-center gap-2.5 min-h-[48px] px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-sky-500 dark:hover:bg-sky-400 high-contrast:bg-yellow-400 high-contrast:text-black text-white dark:text-slate-950 text-sm font-semibold transition-colors disabled:opacity-50"
          >
            <Mic className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span>Start Voice Conversation</span>
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onStop}
              className="inline-flex items-center justify-center gap-2 min-h-[48px] px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 high-contrast:bg-yellow-400 high-contrast:text-black text-white text-sm font-semibold transition-colors"
            >
              <PhoneOff className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span>End Voice</span>
            </button>

            <button
              type="button"
              onClick={onToggleMute}
              aria-pressed={isMuted}
              className="inline-flex items-center justify-center gap-2 min-h-[48px] px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 high-contrast:border-yellow-400 bg-white dark:bg-slate-800 high-contrast:bg-black text-slate-800 dark:text-slate-100 high-contrast:text-yellow-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-semibold transition-colors"
            >
              {isMuted ? (
                <>
                  <MicOff className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Unmute Mic</span>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Mute Mic</span>
                </>
              )}
            </button>

            {voiceState === 'speaking' && (
              <button
                type="button"
                onClick={onInterrupt}
                className="inline-flex items-center justify-center gap-2 min-h-[48px] px-4 py-3 rounded-xl border border-sky-300 dark:border-sky-700 high-contrast:border-white bg-sky-50 dark:bg-sky-950/60 high-contrast:bg-black text-sky-900 dark:text-sky-200 high-contrast:text-white hover:bg-sky-100 dark:hover:bg-sky-900 text-sm font-semibold transition-colors"
              >
                <VolumeX className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Interrupt Reply</span>
              </button>
            )}

            {voiceState === 'listening' && (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 high-contrast:text-white ml-auto">
                <Volume2 className="w-4 h-4" aria-hidden="true" />
                <span>Say &ldquo;Remember...&rdquo; to save to memory</span>
              </span>
            )}
          </>
        )}
      </div>
    </section>
  );
};
