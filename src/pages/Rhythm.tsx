import { useEffect, useRef, useState } from 'react';
import { useNavigate,useSearchParams } from 'react-router';
import { Page } from '../components/Page';
import { ActionButton } from '../components/Controls';
import { paths } from '../app/routes';
import { useCreation } from '../app/CreationContext';
import { ScreenRhythmInput } from '../services/rhythm/ScreenRhythmInput';
import { useRhythmPlayback } from '../services/rhythm/useRhythmPlayback';
import type { RhythmEvent } from '../types/domain';

export function Rhythm() {
  const { draft, setDraft, registerCleanup } = useCreation();
  const navigate = useNavigate();const [params]=useSearchParams();
  const [notice, setNotice] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [recording, setRecording] = useState(false);
  const playback = useRhythmPlayback();
  const pad = useRef<HTMLButtonElement>(null);
  const input = useRef<ScreenRhythmInput | null>(null);
  input.current ??= new ScreenRhythmInput(draft.rhythm, rhythm => setDraft(previous => ({ ...previous, rhythm })));
  const recorder = input.current;
  useEffect(() => {
    const unregister = registerCleanup(() => { recorder.clear(); setRecording(false); });
    const finish = () => { recorder.finish(); setRecording(false); };
    const hidden = () => { if (document.hidden) finish(); };
    window.addEventListener('blur', finish);
    document.addEventListener('visibilitychange', hidden);
    return () => { unregister(); recorder.finish(); window.removeEventListener('blur', finish); document.removeEventListener('visibilitychange', hidden); };
  }, [recorder, registerCleanup]);
  function hit(key: string, source: RhythmEvent['source'], pressure?: number) {
    if (playback.playing) { recorder.finish(); playback.stop(); }
    if (!recorder.press(key, source, pressure)) return;
    setRecording(true); setConfirmClear(false); setNotice(''); setPulse(value => value + 1);
    void playback.tap(pressure && pressure > 0 ? pressure : .65);
  }
  function finish() { recorder.finish(); setRecording(false); }
  const status = playback.playing ? '正在试听' : draft.rhythm.length ? `已记录 ${draft.rhythm.length} 次敲击${recording ? ' · 录制中' : ''}` : '轻触开始录制';
  return <Page title="敲击节奏" className="rhythm-page">
    <button ref={pad} type="button" className="rhythm-area" aria-label="轻触演奏，敲击录制节奏" aria-describedby="rhythm-instructions"
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault(); event.currentTarget.focus();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        // 鼠标与触摸的 pressure=0.5 通常为浏览器默认值，不作为真实压力读取。
        const pressure = event.pointerType === 'pen' ? event.pressure : undefined;
        hit(`pointer-${event.pointerId}`, event.pointerType === 'mouse' ? 'mouse' : 'touch', pressure);
      }}
      onPointerUp={event => recorder.release(`pointer-${event.pointerId}`)}
      onPointerCancel={event => recorder.release(`pointer-${event.pointerId}`)}
      onLostPointerCapture={event => recorder.release(`pointer-${event.pointerId}`)}
      onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); if (!event.repeat) hit(`key-${event.key}`, 'keyboard'); } }}
      onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); recorder.release(`key-${event.key}`); } }}
      onBlur={finish}
      onClick={event => { if (event.detail === 0) { hit('assistive', 'keyboard'); recorder.release('assistive'); } }}>
      <span key={pulse} className={`rhythm-inner ${pulse ? 'tap-pulse' : ''}`}><span aria-hidden="true">♫</span><strong>轻触演奏</strong></span>
    </button>
    <p className="hardware-hint">也可以揉捏、按压球体来创作节奏</p>
    <p className="rhythm-status">{notice || status}</p>
    <p className="sr-only" role="status" aria-live="polite">{notice || (playback.playing ? '正在试听' : recording ? '节奏录制中' : draft.rhythm.length ? '节奏已就绪，可试听或继续敲击' : '轻触开始录制')}</p>
    <button type="button" className="round-play" disabled={!draft.rhythm.length} aria-label={playback.playing ? '停止试听节奏' : '试听节奏'}
      onClick={() => { finish(); void playback.toggle(draft.rhythm); }}><span aria-hidden="true">{playback.playing ? '■' : '▶'}</span></button>
    <p id="rhythm-instructions" className="rhythm-instructions">支持空格或回车敲击。试听后继续敲击会接在末尾，间隔沿用已有节奏；首次默认 400 毫秒。</p>
    <ActionButton tone="surface" className="clear-rhythm" disabled={!draft.rhythm.length} onClick={() => { finish(); playback.stop(); setConfirmClear(true); }}>重新录制</ActionButton>
    {confirmClear && <section className="clear-confirm" aria-label="确认清除节奏"><p>清除当前节奏并重新录制？</p><div className="two-actions"><ActionButton tone="surface" onClick={() => { setConfirmClear(false); pad.current?.focus(); }}>保留节奏</ActionButton><ActionButton onClick={() => { recorder.clear(); setConfirmClear(false); playback.stop(); setRecording(false); setPulse(0); setNotice('节奏已清除，已记录 0 次敲击'); pad.current?.focus(); }}>确认清除</ActionButton></div></section>}
    {playback.error && <p className="feedback" role="alert">{playback.error}</p>}
    <ActionButton className="bottom-action" onClick={() => { finish(); if (!draft.rhythm.length) { setNotice('请先轻触圆形区域，录下一段节奏'); return; } playback.stop(); navigate(params.get('next')==='compose'&&draft.selectedSoundIds.length?paths.prepare:paths.select); }}>下一步 →</ActionButton>
  </Page>;
}
