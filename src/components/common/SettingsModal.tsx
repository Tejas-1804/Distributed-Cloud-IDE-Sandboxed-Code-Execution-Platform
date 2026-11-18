import { Moon, RotateCcw, Sun } from 'lucide-react';
import { useThemeStore } from '../../store/useThemeStore';
import { Modal } from './Modal';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { theme, setTheme, editorSettings, updateEditorSettings, resetEditorSettings } =
    useThemeStore();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="IDE Settings"
      subtitle="Customize appearance and Monaco Editor behavior. Saved automatically in browser storage."
      maxWidthClass="max-w-xl"
    >
      <div className="space-y-5">
        {/* Theme */}
        <div className="flex items-center justify-between gap-4 border-b border-[#CBD5E1] pb-4 dark:border-[#292E38]">
          <div>
            <div className="text-sm font-medium">Color Theme</div>
            <div className="text-xs text-[#475569] dark:text-[#9299A7]">
              Switch between dark and light workbench & editor themes
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-md border border-[#CBD5E1] bg-[#F1F5F9] p-1 dark:border-[#292E38] dark:bg-[#111318]">
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                theme === 'dark'
                  ? 'bg-[#4F8CFF] text-white'
                  : 'text-[#475569] hover:text-[#0F172A] dark:text-[#9299A7] dark:hover:text-[#E5E7EB]'
              }`}
            >
              <Moon className="h-3.5 w-3.5" />
              Dark
            </button>
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                theme === 'light'
                  ? 'bg-[#2563EB] text-white'
                  : 'text-[#475569] hover:text-[#0F172A] dark:text-[#9299A7] dark:hover:text-[#E5E7EB]'
              }`}
            >
              <Sun className="h-3.5 w-3.5" />
              Light
            </button>
          </div>
        </div>

        {/* Font Size */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <label htmlFor="editor-font-size" className="text-sm font-medium">
              Editor Font Size
            </label>
            <div className="text-xs text-[#475569] dark:text-[#9299A7]">
              Controls Monaco code font size in pixels (12–22px)
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="editor-font-size"
              type="range"
              min={12}
              max={22}
              step={1}
              value={editorSettings.fontSize}
              onChange={(e) => updateEditorSettings({ fontSize: Number(e.target.value) })}
              className="w-28 accent-[#4F8CFF]"
            />
            <span className="w-10 text-right font-mono text-xs tabular-nums">
              {editorSettings.fontSize}px
            </span>
          </div>
        </div>

        {/* Tab Size */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Tab Size</div>
            <div className="text-xs text-[#475569] dark:text-[#9299A7]">
              Number of spaces per indentation level
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-md border border-[#CBD5E1] bg-[#F1F5F9] p-1 dark:border-[#292E38] dark:bg-[#111318]">
            {([2, 4] as const).map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => updateEditorSettings({ tabSize: size })}
                className={`rounded px-3 py-1 font-mono text-xs font-medium transition-colors ${
                  editorSettings.tabSize === size
                    ? 'bg-[#4F8CFF] text-white'
                    : 'text-[#475569] hover:text-[#0F172A] dark:text-[#9299A7] dark:hover:text-[#E5E7EB]'
                }`}
              >
                {size} spaces
              </button>
            ))}
          </div>
        </div>

        {/* Toggles */}
        <div className="space-y-3 border-t border-[#CBD5E1] pt-4 dark:border-[#292E38]">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Show Minimap</div>
              <div className="text-xs text-[#475569] dark:text-[#9299A7]">
                Display a high-level code overview on the right edge of the editor
              </div>
            </div>
            <input
              type="checkbox"
              checked={editorSettings.minimap}
              onChange={(e) => updateEditorSettings({ minimap: e.target.checked })}
              className="h-4 w-4 rounded accent-[#4F8CFF]"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Word Wrap</div>
              <div className="text-xs text-[#475569] dark:text-[#9299A7]">
                Wrap long lines within the editor viewport
              </div>
            </div>
            <input
              type="checkbox"
              checked={editorSettings.wordWrap === 'on'}
              onChange={(e) =>
                updateEditorSettings({ wordWrap: e.target.checked ? 'on' : 'off' })
              }
              className="h-4 w-4 rounded accent-[#4F8CFF]"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Line Numbers</div>
              <div className="text-xs text-[#475569] dark:text-[#9299A7]">
                Show line numbers in the editor gutter
              </div>
            </div>
            <input
              type="checkbox"
              checked={editorSettings.lineNumbers === 'on'}
              onChange={(e) =>
                updateEditorSettings({ lineNumbers: e.target.checked ? 'on' : 'off' })
              }
              className="h-4 w-4 rounded accent-[#4F8CFF]"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Format on Save</div>
              <div className="text-xs text-[#475569] dark:text-[#9299A7]">
                Run Monaco formatter automatically before saving supported languages
              </div>
            </div>
            <input
              type="checkbox"
              checked={editorSettings.formatOnSave}
              onChange={(e) => updateEditorSettings({ formatOnSave: e.target.checked })}
              className="h-4 w-4 rounded accent-[#4F8CFF]"
            />
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#CBD5E1] pt-4 dark:border-[#292E38]">
          <button
            type="button"
            onClick={resetEditorSettings}
            className="flex items-center gap-1.5 rounded-md border border-[#CBD5E1] px-3 py-1.5 text-xs font-medium text-[#475569] transition-colors hover:bg-[#F1F5F9] dark:border-[#292E38] dark:text-[#9299A7] dark:hover:bg-[#222631] dark:hover:text-[#E5E7EB]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Defaults
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-[#4F8CFF] px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#3B7AE8]"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
