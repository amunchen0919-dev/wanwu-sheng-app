import { useEffect, useSyncExternalStore } from 'react';
import type { SoundAsset } from '../types/domain';
import { soundPlayer } from '../services/audio/SoundPlayer';
export function useSoundPlayback() {
  const playback = useSyncExternalStore(soundPlayer.subscribe, soundPlayer.getSnapshot);
  useEffect(() => {
    const stop = () => { if (document.hidden) soundPlayer.stop(); };
    document.addEventListener('visibilitychange', stop);
    return () => { document.removeEventListener('visibilitychange', stop); soundPlayer.stop(); };
  }, []);
  return playback;
}
export function SoundPreview({ sound, className = 'sample-play' }: { sound: SoundAsset; className?: string }) {
  const playback = useSyncExternalStore(soundPlayer.subscribe, soundPlayer.getSnapshot);
  const active = playback.soundId === sound.id;
  const playing = active && playback.status === 'playing';
  const loading = active && playback.status === 'loading';
  return <button type="button" className={className} disabled={loading}
    aria-label={`${playing ? '暂停' : active && playback.status === 'paused' ? '继续播放' : '试听'}${sound.name}`}
    onClick={() => void soundPlayer.toggle(sound)}><span aria-hidden="true">{loading ? '…' : playing ? 'Ⅱ' : '▶'}</span></button>;
}
