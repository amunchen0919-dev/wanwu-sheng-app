import type { CreationDraft, RhythmEvent } from '../../types/domain';
export const DRAFT_KEY = 'wanwu-sound:creation:v1';
export type SavedDraft = { version: 1; sessionId?: string; draft: CreationDraft; group: string[]; cardIndex: number };
const validNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export function readDraft(): SavedDraft | undefined {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.version !== 1 || !data.draft || !Array.isArray(data.draft.rhythm)) return;
    const events: RhythmEvent[] = data.draft.rhythm;
    if (!events.every((event, i) => typeof event.id === 'string' && validNumber(event.time) && validNumber(event.duration) &&
      validNumber(event.velocity) && event.velocity <= 1 && ['touch', 'mouse', 'keyboard', 'hardware'].includes(event.source) &&
      (i === 0 ? event.time === 0 : event.time >= events[i - 1].time))) return;
    const ids = { has: (id: unknown) => typeof id === 'string' && id.length > 0 && id.length < 200 }; // 个人素材在IndexedDB异步载入，不因启动时未加载而丢弃草稿
    if (!Array.isArray(data.group) || data.group.length !== 6 || new Set(data.group).size !== 6 || !data.group.every((id: string) => ids.has(id))) return;
    if (!Array.isArray(data.draft.selectedSoundIds) || !data.draft.selectedSoundIds.every((id: string) => ids.has(id)) || typeof data.draft.preferenceText !== 'string') return;
    if (!Number.isInteger(data.cardIndex) || data.cardIndex < 0 || data.cardIndex > 5) return;
    return { version: 1, sessionId: typeof data.sessionId === 'string' && data.sessionId.length > 0 ? data.sessionId : undefined, draft: { rhythm: events, selectedSoundIds: [...new Set<string>(data.draft.selectedSoundIds)], preferenceText: data.draft.preferenceText }, group: data.group, cardIndex: data.cardIndex };
  } catch { return; }
}
export function writeDraft(data: SavedDraft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
}
