import { useState } from 'react';
import { toast } from 'sonner';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import type { StarterTemplate, SupportedLanguage, Workspace } from '../../types/ide';
import { SUPPORTED_LANGUAGES } from '../../utils/language';
import { Modal } from '../common/Modal';

interface CreateWorkspaceModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (workspace: Workspace) => void;
}

const TEMPLATES: { id: StarterTemplate; label: string; description: string }[] = [
  {
    id: 'hello-world',
    label: 'Hello World',
    description: 'Starter entry script with sample output and README.',
  },
  {
    id: 'basic-web',
    label: 'Basic Web Project',
    description: 'HTML, CSS, and JavaScript starter structure.',
  },
  {
    id: 'empty',
    label: 'Empty Project',
    description: 'Blank workspace containing only a README.md file.',
  },
];

export function CreateWorkspaceModal({ open, onClose, onCreated }: CreateWorkspaceModalProps) {
  const { createWorkspace } = useWorkspaceStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState<SupportedLanguage>('python');
  const [template, setTemplate] = useState<StarterTemplate>('hello-world');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Please enter a workspace name.');
      return;
    }

    setSubmitting(true);
    try {
      const workspace = await createWorkspace({
        name: trimmed,
        description,
        language,
        template,
      });
      toast.success(`Created workspace "${workspace.name}"`);
      setName('');
      setDescription('');
      onCreated(workspace);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create workspace.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create New Workspace"
      subtitle="Configure language runtime and starter files. Stored locally in Phase 1."
      maxWidthClass="max-w-lg"
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div>
          <label
            htmlFor="ws-name"
            className="mb-1.5 block text-xs font-medium text-[#0F172A] dark:text-[#E5E7EB]"
          >
            Workspace Name
          </label>
          <input
            id="ws-name"
            type="text"
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. distributed-scheduler"
            className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#4F8CFF] focus:outline-none dark:border-[#292E38] dark:bg-[#111318] dark:text-[#E5E7EB] dark:placeholder:text-[#6B7280]"
          />
        </div>

        <div>
          <label
            htmlFor="ws-desc"
            className="mb-1.5 block text-xs font-medium text-[#0F172A] dark:text-[#E5E7EB]"
          >
            Description <span className="text-[#64748B] dark:text-[#9299A7]">(optional)</span>
          </label>
          <input
            id="ws-desc"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief note about what you are building"
            className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#4F8CFF] focus:outline-none dark:border-[#292E38] dark:bg-[#111318] dark:text-[#E5E7EB] dark:placeholder:text-[#6B7280]"
          />
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium text-[#0F172A] dark:text-[#E5E7EB]">
            Primary Language
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {SUPPORTED_LANGUAGES.map((lang) => {
              const selected = language === lang.id;
              return (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => setLanguage(lang.id)}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                    selected
                      ? 'border-[#4F8CFF] bg-[#4F8CFF]/10 font-semibold text-[#0F172A] dark:text-white'
                      : 'border-[#CBD5E1] bg-white text-[#475569] hover:border-[#94A3B8] dark:border-[#292E38] dark:bg-[#111318] dark:text-[#9299A7] dark:hover:border-[#3E4554]'
                  }`}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: lang.color }}
                  />
                  <span className="truncate">{lang.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium text-[#0F172A] dark:text-[#E5E7EB]">
            Starter Template
          </div>
          <div className="space-y-2">
            {TEMPLATES.map((item) => {
              const selected = template === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTemplate(item.id)}
                  className={`block w-full rounded-md border px-3 py-2 text-left transition-colors ${
                    selected
                      ? 'border-[#4F8CFF] bg-[#4F8CFF]/10'
                      : 'border-[#CBD5E1] bg-white hover:border-[#94A3B8] dark:border-[#292E38] dark:bg-[#111318] dark:hover:border-[#3E4554]'
                  }`}
                >
                  <div className="text-xs font-semibold text-[#0F172A] dark:text-[#E5E7EB]">
                    {item.label}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#475569] dark:text-[#9299A7]">
                    {item.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#CBD5E1] pt-4 dark:border-[#292E38]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#CBD5E1] px-4 py-2 text-xs font-medium text-[#334155] hover:bg-[#F1F5F9] dark:border-[#292E38] dark:text-[#E5E7EB] dark:hover:bg-[#222631]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-[#4F8CFF] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#3B7AE8] disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create & Open'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
