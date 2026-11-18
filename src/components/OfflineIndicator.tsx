import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-40 flex items-center gap-2.5 rounded-xl bg-amber-600 dark:bg-amber-500 high-contrast:bg-yellow-400 text-white dark:text-slate-950 high-contrast:text-black px-3.5 py-2.5 text-xs font-semibold shadow-lg"
    >
      <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>Offline Mode — Using cached chats &amp; local assistant</span>
    </div>
  );
};
