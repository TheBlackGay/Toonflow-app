import { mkdir, readFile, writeAtomic } from "@toonflow/file";
import { join } from "node:path";
import { z } from "zod";
import type { MediaGenerationRequest } from "@toonflow/tools-scaffold/runtime";
import { audioGenerationSchema, imageGenerationSchema, videoGenerationSchema } from "@toonflow/tool-media-generation/runtime";
import { generateMedia } from "@/utils/media/generation";
import { mediaTaskStatusSchema, mediaTypeSchema, workspaceRelativePathSchema, type MediaTaskStatus, type MediaType } from "@/utils/production/contracts";
import { resolveWorkspacePath, waitForWorkspaceFiles } from "@/utils/workspace/files";

export type MediaTask = {
  id: string;
  directory: string;
  mediaType: MediaType;
  request: MediaGenerationRequest;
  status: MediaTaskStatus;
  attempt: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  result?: Awaited<ReturnType<typeof generateMedia>>;
  error?: string;
  errorCode?: string;
};

const generatedMediaSchema = z.object({
  path: workspaceRelativePathSchema,
  mimeType: z.string().trim().min(1).max(128),
  mediaType: mediaTypeSchema,
});
const storedTaskSchema = z.object({
  id: z.uuid(),
  directory: z.string().min(1).max(4096),
  mediaType: mediaTypeSchema,
  request: z.unknown(),
  status: mediaTaskStatusSchema,
  attempt: z.number().int().min(0).default(0),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  startedAt: z.string().trim().min(1).optional(),
  finishedAt: z.string().trim().min(1).optional(),
  result: z.array(generatedMediaSchema).optional(),
  error: z.string().max(10000).optional(),
  errorCode: z.string().trim().max(128).optional(),
});

function requestSchema(mediaType: MediaType) {
  return mediaType === "image" ? imageGenerationSchema : mediaType === "video" ? videoGenerationSchema : audioGenerationSchema;
}

export function validateMediaTaskRequest(mediaType: MediaType, request: unknown): MediaGenerationRequest {
  const parsed = requestSchema(mediaType).safeParse(request);
  if (!parsed.success) throw Object.assign(new Error(parsed.error.issues[0]?.message || "媒体任务参数无效"), { status: 400 });
  return parsed.data as MediaGenerationRequest;
}

function parseStoredTask(value: unknown): MediaTask {
  const parsed = storedTaskSchema.safeParse(value);
  if (!parsed.success) throw new Error("媒体任务记录格式无效，请备份后删除 .toonflow/mediaTasks.json");
  return { ...parsed.data, request: validateMediaTaskRequest(parsed.data.mediaType, parsed.data.request) };
}

const controllers = new Map<string, AbortController>();
const recoveredDirectories = new Set<string>();

async function taskFile(directory: string) {
  const target = await resolveWorkspacePath(directory, ".toonflow/mediaTasks.json", true);
  await mkdir(join(directory, ".toonflow"), { recursive: true });
  return target.path;
}

async function readTasks(directory: string) {
  const path = await taskFile(directory);
  const content = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? "[]" : Promise.reject(error));
  try {
    const value = JSON.parse(content);
    return Array.isArray(value) ? value.map(parseStoredTask) : [];
  } catch {
    throw new Error("媒体任务记录损坏，请备份后删除 .toonflow/mediaTasks.json");
  }
}

async function writeTasks(directory: string, tasks: MediaTask[]) {
  const path = await taskFile(directory);
  await writeAtomic(path, JSON.stringify(tasks, null, 2));
}

async function updateTask(directory: string, id: string, update: Partial<MediaTask>, expected?: MediaTaskStatus[]) {
  return mutateTasks(directory, tasks => {
    const index = tasks.findIndex(task => task.id === id);
    if (index < 0) return undefined;
    if (expected && !expected.includes(tasks[index]!.status)) return tasks[index];
    tasks[index] = { ...tasks[index]!, ...update, updatedAt: new Date().toISOString() };
    return tasks[index];
  });
}

async function mutateTasks<T>(directory: string, mutate: (tasks: MediaTask[]) => T) {
  const path = await taskFile(directory);
  const release = await waitForWorkspaceFiles([path]);
  try {
    const tasks = await readTasks(directory);
    const result = mutate(tasks);
    await writeTasks(directory, tasks);
    return result;
  } finally { release(); }
}

async function runTask(task: MediaTask) {
  const controller = new AbortController();
  controllers.set(task.id, controller);
  try {
    const started = await updateTask(task.directory, task.id, {
      status: "running", attempt: task.attempt + 1, startedAt: new Date().toISOString(), finishedAt: undefined, error: undefined, errorCode: undefined,
    }, ["queued"]);
    if (!started || started.status !== "running") return;
    const result = await generateMedia(task.directory, task.mediaType, task.request, controller.signal);
    if (controllers.get(task.id) !== controller) return;
    await updateTask(task.directory, task.id, { status: "completed", result, finishedAt: new Date().toISOString() }, ["running"]);
  } catch (error) {
    if (controllers.get(task.id) !== controller) return;
    const cancelled = controller.signal.aborted;
    const errorCode = cancelled ? "CANCELLED" : error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "GENERATION_FAILED";
    await updateTask(task.directory, task.id, {
      status: cancelled ? "cancelled" : "failed",
      error: error instanceof Error ? error.message : String(error),
      errorCode,
      finishedAt: new Date().toISOString(),
    }, ["running"]);
  } finally { if (controllers.get(task.id) === controller) controllers.delete(task.id); }
}

export async function createMediaTask(directory: string, mediaType: MediaTask["mediaType"], request: MediaGenerationRequest) {
  await ensureRecovered(directory);
  const normalizedRequest = validateMediaTaskRequest(mediaType, request);
  const now = new Date().toISOString();
  const task: MediaTask = { id: crypto.randomUUID(), directory, mediaType, request: normalizedRequest, status: "queued", attempt: 0, createdAt: now, updatedAt: now };
  await mutateTasks(directory, tasks => { tasks.push(task); });
  void runTask(task).catch(() => {});
  return task;
}

export async function getMediaTask(directory: string, id: string) {
  await ensureRecovered(directory);
  return (await readTasks(directory)).find(task => task.id === id);
}

export async function getMediaTasks(directory: string, ids: string[]) {
  const tasks = await listMediaTasks(directory);
  const wanted = new Set(ids);
  return tasks.filter(task => wanted.has(task.id));
}

export async function listMediaTasks(directory: string) {
  await ensureRecovered(directory);
  return (await readTasks(directory)).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function cancelMediaTask(directory: string, id: string) {
  await ensureRecovered(directory);
  const task = await mutateTasks(directory, tasks => {
    const current = tasks.find(item => item.id === id);
    if (!current) return undefined;
    if (current.status === "queued" || current.status === "running") {
      current.status = "cancelled";
      current.error = "任务已取消";
      current.errorCode = "CANCELLED";
      current.finishedAt = new Date().toISOString();
      current.updatedAt = new Date().toISOString();
    }
    return current;
  });
  controllers.get(id)?.abort();
  return task;
}

export async function retryMediaTask(directory: string, id: string) {
  await ensureRecovered(directory);
  const task = await getMediaTask(directory, id);
  if (!task || !["failed", "cancelled"].includes(task.status)) return task;
  const next = await updateTask(directory, id, { status: "queued", error: undefined, errorCode: undefined, result: undefined, startedAt: undefined, finishedAt: undefined });
  if (next) void runTask(next);
  return next;
}

export async function recoverMediaTasks(directory: string) {
  await mutateTasks(directory, tasks => {
    for (const task of tasks) {
      if (!controllers.has(task.id) && (task.status === "queued" || task.status === "running")) {
        task.status = "failed";
        task.error = "服务重启导致任务中断，请重试";
        task.errorCode = "SERVICE_RESTARTED";
        task.finishedAt = new Date().toISOString();
        task.updatedAt = new Date().toISOString();
      }
    }
  });
}

async function ensureRecovered(directory: string) {
  if (recoveredDirectories.has(directory)) return;
  await recoverMediaTasks(directory);
  recoveredDirectories.add(directory);
}
