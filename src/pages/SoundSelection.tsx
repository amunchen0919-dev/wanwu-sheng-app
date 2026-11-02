import { useState } from 'react';
import { useNavigate,useSearchParams } from 'react-router';
import { Page } from '../components/Page';
import { ActionButton } from '../components/Controls';
import { SoundPreview, useSoundPlayback } from '../components/SoundPreview';
import { useCreation } from '../app/CreationContext';
import { paths } from '../app/routes';
import { chooseSound, createGroup, nextCard } from '../services/sounds/selection';
import { soundPlayer } from '../services/audio/SoundPlayer';

export function SoundSelection() {
  const { draft, setDraft, group, setGroup, cardIndex, setCardIndex, sounds, libraryLoading } = useCreation();
  const [error, setError] = useState('');
  const playback = useSoundPlayback();
  const navigate = useNavigate();const [params]=useSearchParams();
  const sound = sounds.find(asset => asset.id === group[cardIndex]);
  function choose(liked: boolean) {
    if (!sound) return;
    soundPlayer.stop();
    setError('');
    setDraft(previous => ({ ...previous, selectedSoundIds: chooseSound(previous.selectedSoundIds, sound.id, liked) }));
    setCardIndex(previous => nextCard(previous));
  }
  return <Page title="选择声音" back={paths.rhythm} className="select-page" trailing={<span className="selection-count" role="status" aria-live="polite" aria-atomic="true">已选择 {draft.selectedSoundIds.length} 个</span>}>
    <section className="sound-card" aria-label="声音卡片">
      {sound ? <><SoundPreview sound={sound} className="sound-play" />
        <div aria-live="polite" aria-atomic="true"><h2>{sound.name}</h2><p>{cardIndex + 1} / 6{draft.selectedSoundIds.includes(sound.id) ? ' · 已选择' : ''}</p></div></> : <p role={libraryLoading ? 'status' : 'alert'}>{libraryLoading ? '正在读取声音素材' : '声音素材缺失，请换一组'}</p>}
    </section>
    <div className="two-actions"><ActionButton tone="surface" onClick={() => choose(false)}><span aria-hidden="true">←</span>不喜欢</ActionButton><ActionButton onClick={() => choose(true)}>喜欢<span aria-hidden="true">→</span></ActionButton></div>
    <ActionButton tone="surface" onClick={() => { soundPlayer.stop(); setGroup(createGroup(sounds, group)); setCardIndex(0); setError(''); }}>↻ 换一组</ActionButton>
    <ActionButton tone="light" onClick={() => { if (!draft.selectedSoundIds.length) { setError('请至少选择一个声音'); return; } navigate(!draft.rhythm.length&&params.get('flow')==='sound-first'?`${paths.rhythm}?next=compose`:paths.prepare); }}>下一步 →</ActionButton>
    {(error || playback.error) && <p className="feedback" role="alert">{error || playback.error}</p>}
    <p className="sample-note">候选素材包含内置声音和个人录音</p>
  </Page>;
}
