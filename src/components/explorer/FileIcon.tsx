import {
  Braces,
  Code2,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  Globe,
  Hash,
} from 'lucide-react';
import type { FileNodeType } from '../../types/ide';

interface FileIconProps {
  filename: string;
  type: FileNodeType;
  expanded?: boolean;
  className?: string;
}

export function FileIcon({ filename, type, expanded = false, className = 'h-4 w-4' }: FileIconProps) {
  if (type === 'folder') {
    return expanded ? (
      <FolderOpen className={`${className} shrink-0 text-[#4F8CFF]`} />
    ) : (
      <Folder className={`${className} shrink-0 text-[#64748B] dark:text-[#9299A7]`} />
    );
  }

  const ext = filename.toLowerCase().includes('.')
    ? filename.toLowerCase().split('.').pop() ?? ''
    : '';

  switch (ext) {
    case 'py':
      return <FileCode2 className={`${className} shrink-0 text-[#3B82F6]`} />;
    case 'js':
    case 'jsx':
      return <FileCode2 className={`${className} shrink-0 text-[#EAB308]`} />;
    case 'ts':
    case 'tsx':
      return <FileCode2 className={`${className} shrink-0 text-[#38BDF8]`} />;
    case 'java':
      return <Code2 className={`${className} shrink-0 text-[#F97316]`} />;
    case 'c':
    case 'h':
    case 'cpp':
    case 'hpp':
      return <Code2 className={`${className} shrink-0 text-[#818CF8]`} />;
    case 'html':
    case 'htm':
      return <Globe className={`${className} shrink-0 text-[#EF4444]`} />;
    case 'css':
    case 'scss':
      return <Hash className={`${className} shrink-0 text-[#38BDF8]`} />;
    case 'json':
      return <Braces className={`${className} shrink-0 text-[#F59E0B]`} />;
    case 'md':
      return <FileText className={`${className} shrink-0 text-[#94A3B8]`} />;
    default:
      return <FileText className={`${className} shrink-0 text-[#64748B] dark:text-[#9299A7]`} />;
  }
}
