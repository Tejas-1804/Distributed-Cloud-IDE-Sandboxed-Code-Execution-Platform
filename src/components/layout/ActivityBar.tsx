import { Blocks, Box, Files, GitBranch, Search, Settings } from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import type { ActivityView } from '../../types/ide';

interface ActivityBarProps {
  onOpenSettings: () => void;
}

const ACTIVITIES: { id: ActivityView; label: string; icon: typeof Files }[] = [
  { id: 'explorer', label: 'Explorer (Ctrl+B)', icon: Files },
  { id: 'search', label: 'Search Workspace', icon: Search },
  { id: 'environment', label: 'Container Environment', icon: Box },
  { id: 'source-control', label: 'Source Control', icon: GitBranch },
  { id: 'extensions', label: 'Extensions & Runtimes', icon: Blocks },
];

export function ActivityBar({ onOpenSettings }: ActivityBarProps) {
  const { activityView, sidebarOpen, setActivityView } = useWorkspaceStore();

  return (
    <aside
      aria-label="Activity Bar"
      className="flex w-12 shrink-0 flex-col items-center justify-between border-r border-[#CBD5E1] bg-[#E2E8F0]/70 py-2 dark:border-[#292E38] dark:bg-[#14171D]"
    >
      <div className="flex w-full flex-col items-center gap-1">
        {ACTIVITIES.map((item) => {
          const Icon = item.icon;
          const active = sidebarOpen && activityView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActivityView(item.id)}
              title={item.label}
              aria-label={item.label}
              aria-pressed={active}
              className={`relative flex h-10 w-full items-center justify-center transition-colors ${
                active
                  ? 'text-[#0F172A] dark:text-white'
                  : 'text-[#64748B] hover:text-[#0F172A] dark:text-[#9299A7] dark:hover:text-[#E5E7EB]'
              }`}
            >
              {active && (
                <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-r bg-[#4F8CFF]" />
              )}
              <Icon className="h-5 w-5" strokeWidth={1.75} />
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onOpenSettings}
        title="Settings"
        aria-label="Settings"
        className="flex h-10 w-full items-center justify-center text-[#64748B] transition-colors hover:text-[#0F172A] dark:text-[#9299A7] dark:hover:text-[#E5E7EB]"
      >
        <Settings className="h-5 w-5" strokeWidth={1.75} />
      </button>
    </aside>
  );
}
