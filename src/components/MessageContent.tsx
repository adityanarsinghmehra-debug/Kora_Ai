import React, { useState } from 'react';
import { Check, Copy, Volume2, Square } from 'lucide-react';

interface MessageContentProps {
  content: string;
  role: 'user' | 'assistant';
  largeText: boolean;
  isSpeakingThis: boolean;
  onToggleSpeak?: () => void;
}

function renderFormattedInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={idx}
          className="font-mono text-[0.88em] px-1.5 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-800 high-contrast:bg-slate-900 high-contrast:border high-contrast:border-yellow-400"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export const MessageContent: React.FC<MessageContentProps> = ({
  content,
  role,
  largeText,
  isSpeakingThis,
  onToggleSpeak,
}) => {
  const [copiedCodeIdx, setCopiedCodeIdx] = useState<number | null>(null);
  const blocks = content.split(/(```[\s\S]*?```)/g);
  const textClass = largeText ? 'text-lg leading-relaxed' : 'text-[15px] sm:text-base leading-relaxed';

  const copyCode = async (code: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCodeIdx(idx);
      window.setTimeout(() => setCopiedCodeIdx(null), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="space-y-2.5">
      <div className={`${textClass} whitespace-pre-wrap break-words`}>
        {blocks.map((block, idx) => {
          if (block.startsWith('```') && block.endsWith('```') && block.length >= 6) {
            const inner = block.slice(3, -3);
            const firstNewline = inner.indexOf('\n');
            const lang = firstNewline > 0 ? inner.slice(0, firstNewline).trim() : '';
            const code = firstNewline >= 0 ? inner.slice(firstNewline + 1) : inner;

            return (
              <div
                key={idx}
                className="my-3 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 high-contrast:border-yellow-400 bg-slate-950 text-slate-100"
              >
                <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-900 border-b border-slate-800 text-xs text-slate-300">
                  <span className="font-mono">{lang || 'code'}</span>
                  <button
                    type="button"
                    onClick={() => void copyCode(code, idx)}
                    className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-lg hover:bg-slate-800 text-slate-200 transition-colors"
                  >
                    {copiedCodeIdx === idx ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3.5 overflow-x-auto text-xs sm:text-sm font-mono leading-relaxed">
                  <code>{code}</code>
                </pre>
              </div>
            );
          }

          return <React.Fragment key={idx}>{renderFormattedInline(block)}</React.Fragment>;
        })}
      </div>

      {role === 'assistant' && onToggleSpeak && content.trim().length > 0 && (
        <div className="pt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleSpeak}
            aria-label={isSpeakingThis ? 'Stop reading message aloud' : 'Read message aloud'}
            className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 high-contrast:text-yellow-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
          >
            {isSpeakingThis ? (
              <>
                <Square className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Stop Audio</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Read Aloud</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
