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

const TEMPLATES: {
  id: StarterTemplate;
  label: string;
  description: string;
}[] = [
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

export function CreateWorkspaceModal({
  open,
  onClose,
  onCreated,
}: CreateWorkspaceModalProps) {
  const { createWorkspace } = useWorkspaceStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] =
    useState<SupportedLanguage>('python');
  const [template, setTemplate] =
    useState<StarterTemplate>('hello-world');
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
      toast.error(
        err instanceof Error
          ? err.message
          : 'Failed to create workspace.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create workspace"
      subtitle="Set up a new project with its language runtime and starting files."
      maxWidthClass="max-w-xl"
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="space-y-6"
      >
        {/* Workspace details */}
        <section className="space-y-4">
          <div>
            <label
              htmlFor="ws-name"
              className="
                mb-2 block
                text-[11px] font-semibold uppercase tracking-[0.08em]
                text-[#5F554D]
                dark:text-[#A9A29A]
              "
            >
              Workspace name
            </label>

            <input
              id="ws-name"
              type="text"
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. distributed-scheduler"
              className="
                w-full
                border border-[#D8CEC3]
                bg-[#FFFEFC]
                px-3.5 py-2.5
                text-sm text-[#241F1B]
                outline-none
                placeholder:text-[#A59B91]
                transition-[border-color,box-shadow,background-color]
                focus:border-[#7A5138]
                focus:ring-2
                focus:ring-[#7A5138]/10
                dark:border-[#3A332E]
                dark:bg-[#171411]
                dark:text-[#F1ECE6]
                dark:placeholder:text-[#756D65]
                dark:focus:border-[#B78A63]
                dark:focus:ring-[#B78A63]/10
              "
            />
          </div>

          <div>
            <label
              htmlFor="ws-desc"
              className="
                mb-2 block
                text-[11px] font-semibold uppercase tracking-[0.08em]
                text-[#5F554D]
                dark:text-[#A9A29A]
              "
            >
              Description
              <span className="ml-1.5 font-normal normal-case tracking-normal text-[#9A9087] dark:text-[#756D65]">
                optional
              </span>
            </label>

            <input
              id="ws-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief note about what you are building"
              className="
                w-full
                border border-[#D8CEC3]
                bg-[#FFFEFC]
                px-3.5 py-2.5
                text-sm text-[#241F1B]
                outline-none
                placeholder:text-[#A59B91]
                transition-[border-color,box-shadow,background-color]
                focus:border-[#7A5138]
                focus:ring-2
                focus:ring-[#7A5138]/10
                dark:border-[#3A332E]
                dark:bg-[#171411]
                dark:text-[#F1ECE6]
                dark:placeholder:text-[#756D65]
                dark:focus:border-[#B78A63]
                dark:focus:ring-[#B78A63]/10
              "
            />
          </div>
        </section>

        {/* Language */}
        <section>
          <div className="mb-3">
            <div
              className="
                text-[11px] font-semibold uppercase tracking-[0.08em]
                text-[#5F554D]
                dark:text-[#A9A29A]
              "
            >
              Primary language
            </div>

            <div className="mt-1 text-xs text-[#8C8279] dark:text-[#756D65]">
              Choose the runtime used by the workspace.
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {SUPPORTED_LANGUAGES.map((lang) => {
              const selected = language === lang.id;

              return (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => setLanguage(lang.id)}
                  aria-pressed={selected}
                  className={`
                    group
                    flex min-h-[42px] items-center gap-2.5
                    border px-3
                    text-left
                    transition-[border-color,background-color,color,box-shadow]
                    ${
                      selected
                        ? `
                          border-[#7A5138]
                          bg-[#F3E9DE]
                          text-[#3A271C]
                          shadow-[inset_0_0_0_1px_rgba(122,81,56,0.08)]
                          dark:border-[#B78A63]
                          dark:bg-[#2A201A]
                          dark:text-[#F1E8DF]
                        `
                        : `
                          border-[#D8CEC3]
                          bg-[#FFFEFC]
                          text-[#5F554D]
                          hover:border-[#B9AA9D]
                          hover:bg-[#FAF7F3]
                          dark:border-[#3A332E]
                          dark:bg-[#171411]
                          dark:text-[#AAA198]
                          dark:hover:border-[#554A41]
                          dark:hover:bg-[#1D1916]
                        `
                    }
                  `}
                >
                  <span
                    className={`
                      h-2 w-2 shrink-0 rounded-full
                      transition-transform
                      ${selected ? 'scale-110' : 'group-hover:scale-105'}
                    `}
                    style={{ backgroundColor: lang.color }}
                  />

                  <span className="truncate text-xs font-medium">
                    {lang.label}
                  </span>

                  {selected && (
                    <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-[#7A5138] dark:text-[#B78A63]">
                      Selected
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Starter template */}
        <section>
          <div className="mb-3">
            <div
              className="
                text-[11px] font-semibold uppercase tracking-[0.08em]
                text-[#5F554D]
                dark:text-[#A9A29A]
              "
            >
              Starter template
            </div>

            <div className="mt-1 text-xs text-[#8C8279] dark:text-[#756D65]">
              Start with a useful structure or create a clean workspace.
            </div>
          </div>

          <div className="space-y-2">
            {TEMPLATES.map((item) => {
              const selected = template === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTemplate(item.id)}
                  aria-pressed={selected}
                  className={`
                    group
                    relative block w-full
                    border px-4 py-3
                    text-left
                    transition-[border-color,background-color,box-shadow]
                    ${
                      selected
                        ? `
                          border-[#7A5138]
                          bg-[#F7F0E9]
                          shadow-[inset_3px_0_0_#7A5138]
                          dark:border-[#B78A63]
                          dark:bg-[#251D18]
                          dark:shadow-[inset_3px_0_0_#B78A63]
                        `
                        : `
                          border-[#D8CEC3]
                          bg-[#FFFEFC]
                          hover:border-[#B9AA9D]
                          hover:bg-[#FAF7F3]
                          dark:border-[#3A332E]
                          dark:bg-[#171411]
                          dark:hover:border-[#554A41]
                          dark:hover:bg-[#1D1916]
                        `
                    }
                  `}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div
                        className={`
                          text-xs font-semibold
                          ${
                            selected
                              ? 'text-[#3A271C] dark:text-[#F1E8DF]'
                              : 'text-[#302923] dark:text-[#E7E0D9]'
                          }
                        `}
                      >
                        {item.label}
                      </div>

                      <div
                        className="
                          mt-1
                          text-[11px] leading-5
                          text-[#857A70]
                          dark:text-[#837970]
                        "
                      >
                        {item.description}
                      </div>
                    </div>

                    <span
                      className={`
                        mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center
                        rounded-full border
                        ${
                          selected
                            ? 'border-[#7A5138] dark:border-[#B78A63]'
                            : 'border-[#CFC4B9] dark:border-[#4B423A]'
                        }
                      `}
                    >
                      {selected && (
                        <span className="h-1.5 w-1.5 rounded-full bg-[#7A5138] dark:bg-[#B78A63]" />
                      )}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Actions */}
        <div
          className="
            flex items-center justify-between gap-3
            border-t border-[#DED5CC]
            pt-5
            dark:border-[#332D28]
          "
        >
          <div className="hidden text-[10px] text-[#978D84] sm:block dark:text-[#6F675F]">
            Workspace data is stored locally.
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="
                border border-[#D8CEC3]
                bg-transparent
                px-4 py-2.5
                text-xs font-semibold
                text-[#5F554D]
                transition-colors
                hover:border-[#B9AA9D]
                hover:bg-[#F6F1EC]
                dark:border-[#3A332E]
                dark:text-[#B8AEA5]
                dark:hover:border-[#554A41]
                dark:hover:bg-[#211C18]
              "
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="
                border border-[#5E3D2B]
                bg-[#6F4933]
                px-4 py-2.5
                text-xs font-semibold
                text-[#FFF9F3]
                shadow-[0_1px_2px_rgba(50,30,18,0.18)]
                transition-[background-color,border-color,box-shadow,transform]
                hover:border-[#513422]
                hover:bg-[#5F3E2C]
                hover:shadow-[0_2px_6px_rgba(50,30,18,0.16)]
                active:translate-y-px
                disabled:cursor-not-allowed
                disabled:opacity-50
                disabled:shadow-none
              "
            >
              {submitting ? 'Creating…' : 'Create & Open'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
