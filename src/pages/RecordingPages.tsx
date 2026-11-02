import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Page } from '../components/Page';
import { ActionButton, ActionLink } from '../components/Controls';
import { paths } from '../app/routes';
import { useCreation } from '../app/CreationContext';
import { MicrophoneRecorder, recordingError } from '../services/recording/MicrophoneRecorder';
import { RhythmAudio } from '../services/audio/RhythmAudio';
import { soundPlayer } from '../services/audio/SoundPlayer';
import { soundRepository } from '../services/storage/sounds';
import type { SoundAsset } from '../types/domain';
export function Record() {
  const { setRecording } = useCreation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'idle' | 'requesting' | 'recording' | 'stopping'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const recorder = useRef<MicrophoneRecorder | null>(null);
  const cue = useRef<RhythmAudio | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const interval = setInterval(() => { if (recorder.current) setElapsed(recorder.current.elapsed); }, 200);
    return () => { mounted.current = false; clearInterval(interval); recorder.current?.cancel(); void cue.current?.dispose().catch(() => {}); cue.current = null; };
  }, []);
  function feedback() { cue.current ??= new RhythmAudio(); void cue.current.tap(.3).catch(() => {}); }
  async function start() {
    if (status !== 'idle') return;
    soundPlayer.stop(); setError(''); setElapsed(0); setStatus('requesting');
    feedback();
    const current = new MicrophoneRecorder(); recorder.current = current;
    try {
      await current.start();
      if (!mounted.current) return;
      setStatus('recording');
      const result = await current.result!;
      if (!mounted.current) return;
      setRecording(result); navigate(paths.recorded);
    } catch (err) { if (mounted.current) { current.cancel(); recorder.current = null; setStatus('idle'); setError(recordingError(err)); } }
  }
  const seconds = Math.floor(elapsed);
  return <Page title="录音" back={paths.discover} subtitle="聆听身边的声音" className="record-page">
    <button type="button" className="record-core" disabled={status !== 'idle'} aria-label="开始录音" onClick={() => void start()}><span /></button>
    <p className="record-hint" role="status" aria-live="polite">{status === 'requesting' ? '正在请求麦克风权限' : status === 'recording' ? '录音已开始' : status === 'stopping' ? '正在结束录音' : '点击开始录音'}</p>
    <p className="record-timer muted" aria-label={`录音时长 ${seconds} 秒`}>{String(Math.floor(seconds / 60)).padStart(2,'0')}:{String(seconds % 60).padStart(2,'0')}</p>
    <p className="sample-note">最长录制 60 秒，到时自动结束</p>
    {error && <p role="alert" className="feedback">{error}</p>}
    <ActionButton disabled={status !== 'recording'} className="record-end" onClick={() => { setStatus('stopping'); recorder.current?.stop(); }}>■ 结束录音</ActionButton>
  </Page>;
}
export function Recorded() {
  const { recording, setRecording, reloadSounds } = useCreation();
  const navigate = useNavigate();
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const audio = useRef<HTMLAudioElement | null>(null);
  const previewVersion = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (!recording) return; const endCue = new RhythmAudio(); void endCue.tap(.3).catch(() => {}); return () => { void endCue.dispose().catch(() => {}); }; }, [recording]);
  useEffect(() => {
    if (!recording) return;
    const url = URL.createObjectURL(recording.blob);
    const element = new Audio(url); audio.current = element;
    element.onended = () => setPlaying(false);
    element.onerror = () => { setPlaying(false); setError('录音无法播放，请尝试重新录音或使用其他浏览器'); };
    const hidden = () => { if (document.hidden) { element.pause(); element.currentTime = 0; setPlaying(false); } };
    document.addEventListener('visibilitychange', hidden);
    return () => { previewVersion.current++; element.pause(); element.onended = null; element.onerror = null; element.removeAttribute('src'); element.load(); audio.current = null; URL.revokeObjectURL(url); document.removeEventListener('visibilitychange', hidden); };
  }, [recording]);
  async function preview() {
    const element = audio.current; if (!element) return; const version = ++previewVersion.current;
    if (playing) { element.pause(); element.currentTime = 0; setPlaying(false); return; }
    soundPlayer.stop(); setError('');
    try { await element.play(); if (version === previewVersion.current) setPlaying(true); else element.pause(); } catch { setError('无法试听录音，请再次点击或检查浏览器音频设置'); }
  }
  async function save() {
    if (!recording || saving) return;
    previewVersion.current++; setSaving(true); setError(''); audio.current?.pause(); setPlaying(false);
    try {
      const existing = await soundRepository.list();
      const asset: SoundAsset = { id: recording.id, name: name.trim() || existing.find(item => item.id === recording.id)?.name || `我的录音 ${existing.filter(item => item.source === 'recording').length + 1}`,
        source: 'recording', createdAt: recording.createdAt, duration: recording.duration, mimeType: recording.mimeType, blobId: recording.id };
      await soundRepository.save(asset, recording.blob);
      await reloadSounds(); if (!mounted.current) return; setRecording(undefined); navigate(paths.library, { state: { added: asset.id } });
    } catch (err) { if (!mounted.current) return; setError(`保存失败：${err instanceof Error ? err.message : '请检查本地存储空间后重试'}`); setSaving(false); }
  }
  return <Page title="录音完成" back={paths.record} className="recorded-page">
    <div className="recorded-symbol" aria-hidden="true">♫</div><h2 className="center">{recording ? '录音完成，可以试听' : '还没有录音文件'}</h2>
    {recording && <><p className="sample-note" role="status">录音已结束，共 {recording.duration.toFixed(1)} 秒。未保存前刷新会丢失。</p><label className="recording-name">声音名称（可选）<input maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="自动命名为我的录音" /></label></>}
    {error && <p role="alert" className="feedback">{error}</p>}
    <div className="recorded-actions"><ActionButton tone="surface" disabled={!recording || saving} onClick={() => void preview()}>{playing ? '停止试听录音' : '试听录音'}</ActionButton>
      <ActionLink to={paths.record} tone="green">重新录音</ActionLink><ActionButton disabled={!recording || saving} onClick={() => void save()}>{saving ? '正在保存声音' : '保存声音'}</ActionButton></div>
  </Page>;
}
