import {MusicProvider} from './MusicContext';
import { Record, Recorded } from '../pages/RecordingPages';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { CreationProvider, useCreation } from './CreationContext';
import { pageCatalog, paths } from './routes';
import { Home } from '../pages/Home';
import { Discover, Mine } from '../pages/EntryPages';
import { Prepare, Composing, Player, Works, Saved } from '../pages/CreationPages';
import { Camera, PhotoResult } from '../pages/CapturePages';
import { Rhythm } from '../pages/Rhythm';
import { SoundSelection } from '../pages/SoundSelection';
import { Library } from '../pages/Library';
import { Page } from '../components/Page';
import { ActionLink } from '../components/Controls';

const AudioLab = import.meta.env.DEV ? lazy(() => import('../pages/AudioLab')) : null;

function PreviewIndex() {
  const details = useRef<HTMLDetailsElement>(null);
  const { key } = useLocation();
  useEffect(() => { if (details.current) details.current.open = false; }, [key]);
  return <footer className="preview-footer">
    <p id="preview-notice" className="preview-notice">界面预览：节奏录制、声音选择和示例试听已可用；麦克风录音与声音保存已可用；AI编曲与作品保存已接入。拍照识别仍为演示；模拟体验不是真实AI作品。</p>
    {import.meta.env.DEV && <ActionLink to="/dev/audio-lab" tone="surface">开发测试 · Stable Audio</ActionLink>}
    <details ref={details} className="preview-index"><summary>界面预览 · 阶段一 / 二</summary>
    <p>这是界面与导航版本。可直接查看尚未接入功能的结果页。</p>
    <nav aria-label="全部页面预览">{pageCatalog.map(([id, name, path]) => <ActionLink key={id} to={path} tone="surface">{id} · {name}</ActionLink>)}</nav>
  </details></footer>;
}

function CreationScreens() {
  const { sessionId } = useCreation();
  return <>
    <a className="skip-link" href="#main" onClick={event => {
      event.preventDefault();
      document.getElementById('main')?.focus();
    }}>跳到主要内容</a>
    <div key={sessionId} className="app-shell"><Routes>
      {import.meta.env.DEV && AudioLab && <Route path="/dev/audio-lab" element={<Suspense fallback={<p role="status">正在加载测试页</p>}><AudioLab /></Suspense>} />}
      <Route path={paths.home} element={<Home />} />
      <Route path={paths.rhythm} element={<Rhythm />} />
      <Route path={paths.discover} element={<Discover />} />
      <Route path={paths.select} element={<SoundSelection />} />
      <Route path={paths.prepare} element={<Prepare />} />
      <Route path={paths.record} element={<Record />} />
      <Route path={paths.camera} element={<Camera />} />
      <Route path={paths.composing} element={<Composing />} />
      <Route path={paths.library} element={<Library />} />
      <Route path={paths.player} element={<Player />} />
      <Route path={paths.mine} element={<Mine />} />
      <Route path={paths.works} element={<Works />} />
      <Route path={paths.saved} element={<Saved />} />
      <Route path={paths.photoResult} element={<PhotoResult />} />
      <Route path={paths.recorded} element={<Recorded />} />
      <Route path={paths.emptyLibrary} element={<Library standalone />} />
      <Route path="*" element={<Page title="找不到这个页面"><ActionLink to={paths.home}>返回首页</ActionLink></Page>} />
    </Routes>{import.meta.env.DEV?<PreviewIndex />:<p className="sample-note">声音和作品保存在此浏览器中，请及时下载备份。</p>}</div>
  </>;
}

export function App() { return <CreationProvider><MusicProvider><CreationScreens /></MusicProvider></CreationProvider>; }
