import type Database from 'better-sqlite3';
type Egg = 'rocket' | 'blackHole' | 'signal';
export const APP_ID: string;
export const NAMESPACE: string;
export const EGG_DEFINITIONS: Record<Egg, { title: string; sourceApp: string }>;
export const LEGACY_EGGS: Record<string, Egg>;
export const REWARD: { title: string; chatbotPersonality: { id: string; name: string; basePersonality: string; tone: string; responseStyle: string } };
export function mergeEasterEggData(current: unknown, incoming: unknown): Record<string, any>;
export function reconcileEasterEggs(db: Database.Database, userId: string, completion?: { egg: Egg; metadata?: Record<string, unknown> }): {
  appId: string; namespace: string; schemaVersion: number; revision: number; data: Record<string, any>;
  createdAt: string; updatedAt: string; eggs: Record<Egg, boolean>; title: string | null; complete: boolean;
};
export function discoveryStatus(db: Database.Database, userId: string): {
  schemaVersion: number; discoveredCount: number; total: number; complete: boolean;
  discoveries: Array<{ id: Egg | null; title: string; sourceApp: string | null; discovered: boolean; discoveredAt: string | null }>;
  reward: typeof REWARD | null;
};
