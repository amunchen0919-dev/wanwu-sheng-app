import { useCreation } from '../../app/CreationContext';
import { useEffect, useRef, useState } from 'react';
import { RhythmAudio } from '../audio/RhythmAudio';
import { soundPlayer } from '../audio/SoundPlayer';
import type { RhythmEvent } from '../../types/domain';
export function useRhythmPlayback() {
  const { registerCleanup } = useCreation();
  const audio = useRef<RhythmAudio | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const version = useRef(0);
  function stop() { version.current++; audio.current?.stop(); setPlaying(false); }
  function service() { return audio.current ??= new RhythmAudio(); }
  async function tap(velocity: number) {
    setError('');
    const current = version.current;
    try { await service().tap(velocity); } catch (e) { if (current === version.current) setError(e instanceof Error ? e.message : '无法播放敲击声音'); }
  }
  async function toggle(events: RhythmEvent[]) {
    if (playing) { stop(); return; }
    soundPlayer.stop();
    const current = ++version.current;
    setError(''); setPlaying(true);
    try { await service().play(events, () => { if (current === version.current) setPlaying(false); }); }
    catch (e) { if (current === version.current) { setPlaying(false); setError(e instanceof Error ? e.message : '无法试听节奏'); } }
  }
  useEffect(() => {
    const unregister = registerCleanup(stop);
    const hidden = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hidden);
    const unsubscribe = soundPlayer.subscribe(() => { if (soundPlayer.getSnapshot().status === 'loading') stop(); });
    return () => { unregister(); version.current++; document.removeEventListener('visibilitychange', hidden); unsubscribe(); void audio.current?.dispose().catch(() => { /* 离页关闭失败时已停止所有声音 */ }); audio.current = null; };
  }, [registerCleanup]);
  return { playing, error, stop, tap, toggle };
}
