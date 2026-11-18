import React, { useEffect } from 'react';
import { Download, MessageSquarePlus, Trash2, Upload, X } from 'lucide-react';
import { type ChatSession } from '../types/chat';
import { PWAInstallButton } from './PWAInstallButton';

interface SidebarProps {
  chats: ChatSession[];
  activeChatId: string;
  isOpenMobile: boolean;
  memoriesCount: number;
  preferredName: string;
  onCloseMobile: () => void;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  onExportBackup: () => void;
  onOpenImport: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  chats,
  activeChatId,
  isOpenMobile,
  memoriesCount,
  preferredName,
  onCloseMobile,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onExportBackup,
  onOpenImport,
}) => {
  useEffect(() => {
    if (!isOpenMobile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseMobile();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpenMobile, onCloseMobile]);

  const content = (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 high-contrast:bg-black border-r border-slate-200 dark:border-slate-800 high-contrast:border-yellow-400">
      <div className="p-4 flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onClick={() => {
            onNewChat();
            onCloseMobile();
          }}
          className="flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-sky-500 dark:hover:bg-sky-400 high-contrast:bg-yellow-400 high-contrast:text-black text-white dark:text-slate-950 text-sm font-semibold transition-colors"
        >
          <MessageSquarePlus className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>New Chat</span>
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close conversation sidebar"
          className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 high-contrast:text-yellow-300 tabular-nums">
        {preferredName ? `${preferredName} · ` : ''}
        {memoriesCount} saved {memoriesCount === 1 ? 'memory' : 'memories'}
      </div>

      <nav aria-label="Saved conversations" className="flex-1 overflow-y-auto kora-scroll p-3 space-y-1">
        {chats.map((chat) => {
          const isActive = chat.id === activeChatId;
          return (
            <div
              key={chat.id}
              className={`group flex items-center gap-1 rounded-xl transition-colors ${
                isActive
                  ? 'bg-slate-100 dark:bg-slate-800 high-contrast:bg-yellow-400 high-contrast:text-black'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  onSelectChat(chat.id);
                  onCloseMobile();
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`flex-1 min-w-0 min-h-[44px] text-left px-3 py-2 rounded-xl text-sm ${
                  isActive
                    ? 'font-semibold text-slate-900 dark:text-white high-contrast:text-black'
                    : 'text-slate-700 dark:text-slate-300 high-contrast:text-white'
                }`}
              >
                <span className="block truncate">{chat.title}</span>
                <span
                  className={`block text-[11px] tabular-nums ${
                    isActive
                      ? 'text-slate-500 dark:text-slate-400 high-contrast:text-black'
                      : 'text-slate-400 dark:text-slate-500 high-contrast:text-slate-300'
                  }`}
                >
                  {chat.messageCount} messages
                </span>
              </button>

              {chats.length > 1 && (
                <button
                  type="button"
                  onClick={() => onDeleteChat(chat.id)}
                  aria-label={`Delete conversation ${chat.title}`}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 high-contrast:text-current opacity-80 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
        <PWAInstallButton />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onExportBackup}
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 high-contrast:border-white text-xs font-semibold text-slate-700 dark:text-slate-200 high-contrast:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Export</span>
          </button>
          <button
            type="button"
            onClick={onOpenImport}
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 high-contrast:border-white text-xs font-semibold text-slate-700 dark:text-slate-200 high-contrast:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Upload className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Import</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside aria-label="Conversation history" className="hidden lg:block w-72 shrink-0 h-full">
        {content}
      </aside>

      {/* Mobile slide-over drawer */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            aria-hidden="true"
            onClick={onCloseMobile}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
          />
          <aside
            aria-label="Conversation history drawer"
            className="relative w-80 max-w-[85vw] h-full z-10 shadow-2xl"
          >
            {content}
          </aside>
        </div>
      )}
    </>
  );
};
