import { soundRepository } from '../services/storage/sounds';
import { soundPlayer } from '../services/audio/SoundPlayer';
import type { CapturedRecording } from '../services/recording/MicrophoneRecorder';
import type { SoundAsset, CreationDraft } from '../types/domain';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type SetStateAction } from 'react';
import { readDraft, writeDraft } from '../services/storage/draft';
import { createGroup } from '../services/sounds/selection';
import { builtinSounds } from '../services/sounds/catalog';

type Session = { sessionId: string; draft: CreationDraft; group: string[]; cardIndex: number; recording?: CapturedRecording };
function newSession(sounds: SoundAsset[]): Session {
  return { sessionId: crypto.randomUUID(), draft: { rhythm: [], selectedSoundIds: [], preferenceText: '' }, group: createGroup(sounds), cardIndex: 0 };
}
const CreationContext = createContext<{
  sessionId: string; startNewCreation: () => void; registerCleanup: (cleanup: () => void) => () => void;
  recording?: CapturedRecording; setRecording: React.Dispatch<SetStateAction<CapturedRecording | undefined>>;
  sounds: SoundAsset[]; libraryError: string; libraryLoading: boolean; reloadSounds: () => Promise<void>;
  group: string[]; setGroup: React.Dispatch<SetStateAction<string[]>>;
  cardIndex: number; setCardIndex: React.Dispatch<SetStateAction<number>>;
  draft: CreationDraft; setDraft: React.Dispatch<SetStateAction<CreationDraft>>;
} | null>(null);

export function CreationProvider({ children }: { children: ReactNode }) {
  const [sounds, setSounds] = useState<SoundAsset[]>(builtinSounds);
  const [libraryError, setLibraryError] = useState('');
  const [libraryLoading, setLibraryLoading] = useState(true);
  async function reloadSounds() {
    setLibraryLoading(true);
    try { setSounds([...builtinSounds, ...await soundRepository.list()]); setLibraryError(''); }
    catch (error) { setLibraryError(error instanceof Error ? error.message : '声音库读取失败'); }
    finally { setLibraryLoading(false); }
  }
  useEffect(() => { void reloadSounds(); }, []);
  const [session, setSession] = useState<Session>(() => {
    const restored = readDraft();
    return restored ? { ...restored, sessionId: restored.sessionId ?? crypto.randomUUID() } : newSession(builtinSounds);
  });
  const currentId = useRef(session.sessionId);
  const cleanups = useRef(new Set<() => void>());
  const registerCleanup = useCallback((cleanup: () => void) => { cleanups.current.add(cleanup); return () => { cleanups.current.delete(cleanup); }; }, []);
  const [storageError, setStorageError] = useState('');
  function persist(value: Session) {
    try { writeDraft({ version: 1, sessionId: value.sessionId, draft: value.draft, group: value.group, cardIndex: value.cardIndex }); setStorageError(''); }
    catch { setStorageError('无法保存创作草稿，刷新可能丢失；请检查浏览器本地存储空间或隐私设置。'); }
  }
  useEffect(() => {
    // 重置已同步写入新草稿，任何旧提交的effect都不能覆盖它。
    if (session.sessionId === currentId.current) persist(session);
  }, [session]);
  function startNewCreation() {
    const next = newSession(sounds);
    currentId.current = next.sessionId;
    soundPlayer.stop();
    for (const cleanup of cleanups.current) cleanup();
    setSession(next);
    persist(next); // 点击时同步替换持久化草稿，不等待路由或异步加载。
  }
  // setter绑定创建它的会话，旧录制器、旧异步任务及卸载回调无法污染新会话。
  function setter<K extends 'draft' | 'group' | 'cardIndex' | 'recording'>(key: K) {
    return (value: SetStateAction<Session[K]>) => {
      if (session.sessionId !== currentId.current) return;
      setSession(previous => {
        if (previous.sessionId !== session.sessionId) return previous;
        return { ...previous, [key]: typeof value === 'function' ? (value as (old: Session[K]) => Session[K])(previous[key]) : value };
      });
    };
  }
  return <CreationContext.Provider value={{ ...session, startNewCreation, registerCleanup, setRecording: setter('recording'), sounds, libraryError, libraryLoading, reloadSounds,
    setDraft: setter('draft'), setGroup: setter('group'), setCardIndex: setter('cardIndex') }}>{children}{storageError && <p className="feedback" role="alert">{storageError}</p>}</CreationContext.Provider>;
}
export function useCreation() {
  const context = useContext(CreationContext);
  if (!context) throw new Error('创作状态需要 CreationProvider');
  return context;
}
