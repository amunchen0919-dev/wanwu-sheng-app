import {useMusic} from '../app/MusicContext';
import { useCreation } from '../app/CreationContext';
import { Link, useNavigate } from 'react-router';
import { paths } from '../app/routes';
import { usePageFocus } from '../app/usePageFocus';

export function Home() {
  const { startNewCreation } = useCreation();
  const navigate = useNavigate();const music=useMusic();
  const title = usePageFocus('听见万物');
  return <main id="main" tabIndex={-1} aria-labelledby="page-title" className="page home">
    <h1 id="page-title" ref={title} tabIndex={-1}>万物声</h1>
    <p className="tagline">听见万物</p>
    <h2>今天想听见什么？</h2>
    <nav className="home-entries" aria-label="主要入口">
      <Link to={paths.discover} className="entry discover">发现声音<span aria-hidden="true">↗</span></Link>
      <button type="button" className="entry create" disabled={music.busy} onClick={async() => { if(music.task?.status==='complete'&&!await music.prepareAgain())return;startNewCreation(); navigate(paths.rhythm); }}>开始创作<span aria-hidden="true">↗</span></button>
      <Link to={paths.mine} className="entry mine">我的声音<span aria-hidden="true">↗</span></Link>
    </nav>
    <button type="button" className="action surface" disabled={music.busy} onClick={async()=>{if(music.task?.status==='complete'&&!await music.prepareAgain())return;startNewCreation();navigate(`${paths.select}?flow=sound-first`);}}>先选择声音，再敲击节奏</button>
    {music.task&&<Link className="action surface" to={music.task.status==='complete'?paths.player:paths.composing}>{music.task.status==='complete'?'查看上一次作品':'查询进行中的创作任务'}</Link>}
    {music.error&&<p role="alert">{music.error}</p>}
  </main>;
}
