import { Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { offlineSyncQueue } from '../../services/offline/offlineSyncQueue';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const [queuedCount, setQueuedCount] = useState(() => offlineSyncQueue.getCount());

  useEffect(() => {
    return offlineSyncQueue.subscribe(setQueuedCount);
  }, []);

  if (isOnline && queuedCount === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-8 left-4 z-50 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur-md ${
        !isOnline
          ? 'border-[#D97706]/40 bg-[#FEF3C7]/95 text-[#92400E] dark:border-[#F59E0B]/40 dark:bg-[#291F0C]/95 dark:text-[#FBBF24]'
          : 'border-[#4F8CFF]/40 bg-[#EFF6FF]/95 text-[#1D4ED8] dark:border-[#4F8CFF]/40 dark:bg-[#131D31]/95 dark:text-[#93C5FD]'
      }`}
    >
      {!isOnline ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
      <span>
        {!isOnline
          ? `Offline Mode${queuedCount > 0 ? ` · ${queuedCount} pending save${queuedCount > 1 ? 's' : ''}` : ' · Local JS/WASM execution active'}`
          : `Syncing ${queuedCount} queued offline edit${queuedCount > 1 ? 's' : ''}...`}
      </span>
    </div>
  );
}
