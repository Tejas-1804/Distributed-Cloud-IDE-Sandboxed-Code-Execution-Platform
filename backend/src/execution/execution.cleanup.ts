import type { ExecutionDriver } from './execution.types.js';

export async function cleanupExecutionArtifacts(
  driver: ExecutionDriver,
  containerId: string,
  tempDir: string,
): Promise<void> {
  if (!tempDir || !tempDir.startsWith('/tmp/exec_')) {
    return;
  }
  await driver.cleanupTempDir(containerId, tempDir).catch(() => {});
}
