import { mkdir, readFile, writeAtomic } from "@toonflow/file";
import { join } from "node:path";
import { resolveWorkspacePath, waitForWorkspaceFiles } from "@/utils/workspace/files";
import { validateProductionManifest, validateProductionShot, type ProductionManifest, type ProductionShot } from "@/utils/production/contracts";

export { canTransitionShotStatus, productionManifestSchema, productionShotSchema, shotStatusSchema, validateProductionManifest, validateProductionShot } from "@/utils/production/contracts";
export type { ProductionManifest, ProductionShot, ShotStatus } from "@/utils/production/contracts";

async function manifestPath(directory: string) {
  await mkdir(join(directory, ".toonflow"), { recursive: true });
  return (await resolveWorkspacePath(directory, ".toonflow/production.json", true)).path;
}

export async function readProductionManifest(directory: string): Promise<ProductionManifest> {
  const path = await manifestPath(directory);
  const content = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? "" : Promise.reject(error));
  if (!content) return { version: 1, updatedAt: new Date().toISOString(), shots: [] };
  try {
    const value = JSON.parse(content) as Partial<ProductionManifest>;
    return validateProductionManifest({ version: value.version, updatedAt: value.updatedAt ?? new Date().toISOString(), exportedPath: value.exportedPath, shots: value.shots });
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("生产清单 JSON 格式无效", { cause: error });
    throw error;
  }
}

export async function writeProductionManifest(directory: string, manifest: ProductionManifest) {
  const path = await manifestPath(directory);
  const next = validateProductionManifest({ ...manifest, updatedAt: new Date().toISOString() });
  const release = await waitForWorkspaceFiles([path]);
  try { await writeAtomic(path, JSON.stringify(next, null, 2)); }
  finally { release(); }
  return next;
}

export async function updateProductionManifest(directory: string, update: (manifest: ProductionManifest) => void) {
  const path = await manifestPath(directory);
  const release = await waitForWorkspaceFiles([path]);
  try {
    const content = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? "" : Promise.reject(error));
    const manifest = content ? JSON.parse(content) as Partial<ProductionManifest> : { version: 1, shots: [] } as Partial<ProductionManifest>;
    const current = validateProductionManifest({ version: manifest.version, updatedAt: manifest.updatedAt ?? new Date().toISOString(), exportedPath: manifest.exportedPath, shots: manifest.shots ?? [] });
    update(current);
    const next = validateProductionManifest({ ...current, updatedAt: new Date().toISOString() });
    await writeAtomic(path, JSON.stringify(next, null, 2));
    return next;
  } finally { release(); }
}

export function validateShot(value: unknown): ProductionShot {
  return validateProductionShot(value);
}

export function getProductionExportInputs(manifest: ProductionManifest) {
  const incomplete = manifest.shots.filter(shot => shot.mediaType !== "video" || !shot.outputPath);
  if (incomplete.length) {
    throw Object.assign(new Error(`还有 ${incomplete.length} 个镜头没有可导出的视频`), { status: 409 });
  }
  return [...manifest.shots].sort((left, right) => left.order - right.order).map(shot => shot.outputPath!);
}
