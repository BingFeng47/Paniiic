// Types for taskInfo.mjs so the Vitest suite can import it under strict TypeScript.
export type CheckedTasks = Record<string, string>;
export type AllChecked = Record<string, CheckedTasks>;
export interface FinishedTask {
  readonly spec: string;
  readonly id: string;
  readonly title: string;
}
export interface LockOptions {
  readonly name?: string;
  readonly waitMs?: number;
  readonly staleMs?: number;
}

export const SPECS_DIR: string;
export const CACHE_DIR: string;
export const SNAPSHOT: string;
export const LAST_PAYLOAD: string;
export const LAST_SUITE_RUN: string;

export function checkedTasks(markdown: string): CheckedTasks;
export function readAllChecked(root?: string): AllChecked;
export function newlyChecked(before: AllChecked, now: AllChecked): FinishedTask[];
export function specFromEvent(event: unknown): string;
export function taskFromEvent(event: unknown): string;
export function canReuseRun(lastRun: { readonly startedAt?: unknown } | null | undefined, hookStartedAt: number): boolean;
export function readJson(path: string): unknown;
export function readSnapshot(root?: string): AllChecked | null;
export function writeJson(path: string, value: unknown): void;
export function sleep(ms: number): void;
export function withLock<T>(fn: () => T, options?: LockOptions): T;
export function shorten(text: string, max?: number): string;
