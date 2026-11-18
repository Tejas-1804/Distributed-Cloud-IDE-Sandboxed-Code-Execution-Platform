import type { TreeNode, WorkspaceFile } from '../types/ide';

export function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

export function getParentPath(path: string): string {
  const clean = normalizePath(path);
  const lastSlash = clean.lastIndexOf('/');
  return lastSlash === -1 ? '' : clean.slice(0, lastSlash);
}

export function joinPath(parentPath: string, name: string): string {
  const cleanParent = normalizePath(parentPath);
  const cleanName = normalizePath(name);
  if (!cleanParent) return cleanName;
  if (!cleanName) return cleanParent;
  return `${cleanParent}/${cleanName}`;
}

export function validateEntryName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'Name cannot be empty.';
  }
  if (trimmed === '.' || trimmed === '..') {
    return 'Invalid name.';
  }
  if (/[/\\:*?"<>|]/.test(trimmed)) {
    return 'Name cannot contain / \\ : * ? " < > |';
  }
  return null;
}

export function buildFileTree(files: WorkspaceFile[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const file of files) {
    nodeMap.set(file.path, { file, children: [] });
  }

  for (const file of files) {
    const node = nodeMap.get(file.path);
    if (!node) continue;

    if (!file.parentPath) {
      roots.push(node);
    } else {
      const parentNode = nodeMap.get(file.parentPath);
      if (parentNode) {
        parentNode.children.push(node);
      } else {
        roots.push(node);
      }
    }
  }

  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    nodes.sort((a, b) => {
      if (a.file.type !== b.file.type) {
        return a.file.type === 'folder' ? -1 : 1;
      }
      return a.file.name.localeCompare(b.file.name, undefined, { sensitivity: 'base' });
    });
    for (const node of nodes) {
      if (node.children.length > 0) {
        sortNodes(node.children);
      }
    }
    return nodes;
  };

  return sortNodes(roots);
}

export function formatRelativeTime(isoDate: string): string {
  const timestamp = new Date(isoDate).getTime();
  if (Number.isNaN(timestamp)) return 'Unknown';

  const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSeconds < 60) return 'Just now';
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  if (diffSeconds < 604800) return `${Math.floor(diffSeconds / 86400)}d ago`;

  return new Date(isoDate).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
