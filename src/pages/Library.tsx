import { useLocation, useNavigate } from 'react-router';
import { useCreation } from '../app/CreationContext';
import { ActionButton } from '../components/Controls';
import { soundPlayer } from '../services/audio/SoundPlayer';
import { Page } from '../components/Page';
import { ActionLink } from '../components/Controls';
import { builtinSounds } from '../services/sounds/catalog';
import { SoundPreview, useSoundPlayback } from '../components/SoundPreview';
import { paths } from '../app/routes';

export function Library({ standalone = false }: { standalone?: boolean }) {
  const playback = useSoundPlayback();
  const { sounds, libraryError, libraryLoading, reloadSounds, setDraft, setGroup, setCardIndex } = useCreation();
  const personal = sounds.filter(sound => sound.source !== 'builtin');
  const location = useLocation(); const navigate = useNavigate();
  return <Page title="我的声音库" back={paths.mine} className={`library-page ${standalone ? 'empty-library-page' : ''}`}>
    {location.state?.added && <p role="status" aria-live="polite" className="feedback">✓ 已加入新的声音</p>}
    {libraryLoading && <p role="status">正在读取声音库</p>}
    {libraryError && <div><p role="alert">{libraryError}</p><ActionButton tone="surface" onClick={() => void reloadSounds()}>重试读取声音库</ActionButton></div>}
    {!personal.length ? <div className="empty-library"><span className="empty-symbol" aria-hidden="true">♫</span><h2>这里还没有声音</h2><p>录制身边的声音，建立你的声音库</p></div> : <section className="personal-library" aria-labelledby="personal-title"><h2 id="personal-title">我的录音</h2><ul className="personal-sounds">{personal.map(sound => <li key={sound.id}><h3>{sound.name}</h3><p><time dateTime={new Date(sound.createdAt).toISOString()}>{new Date(sound.createdAt).toLocaleString('zh-CN')}</time> · {(sound.duration ?? 0).toFixed(1)} 秒</p><div className="two-actions"><SoundPreview sound={sound} /><ActionButton tone="green" onClick={() => {
      soundPlayer.stop(); setDraft(previous => ({ ...previous, selectedSoundIds: [...new Set([...previous.selectedSoundIds, sound.id])] }));
      setGroup([sound.id, ...sounds.filter(item => item.id !== sound.id).slice(0,5).map(item => item.id)]); setCardIndex(0); navigate(paths.select);
    }}>用于创作</ActionButton></div></li>)}</ul></section>}
    {!standalone && <section className="builtin-library" aria-labelledby="builtin-title"><h2 id="builtin-title">内置声音 · 合成示例</h2><ul className="sound-list">{builtinSounds.map(sound => <li key={sound.id}><span>{sound.name}</span><SoundPreview sound={sound} /></li>)}</ul><ActionLink to={paths.select}>选择声音用于创作</ActionLink></section>}
    {playback.error && <p role="alert">{playback.error}</p>}
    <ActionLink to={paths.discover} className="bottom-action">＋ 添加声音</ActionLink>
  </Page>;
}
