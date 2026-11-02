import { Page } from '../components/Page';
import { ActionLink } from '../components/Controls';
import { paths } from '../app/routes';

export function Discover() {
  return <Page title="声音邂逅" className="discover-page">
    <nav className="discover-entries" aria-label="发现声音的方式">
      <ActionLink to={paths.record} tone="light"><span aria-hidden="true">●</span>录音</ActionLink>
      <ActionLink to={paths.camera}><span aria-hidden="true">▣</span>拍照</ActionLink>
    </nav>
  </Page>;
}

export function Mine() {
  return <Page title="我的声音" subtitle="收藏你的声音与音乐" className="mine-page">
    <nav className="mine-entries" aria-label="我的内容">
      <ActionLink to={paths.works} tone="light" className="mine-card"><span className="card-symbol" aria-hidden="true">♫</span><span>我制作的音乐</span><span className="arrow" aria-hidden="true">→</span></ActionLink>
      <ActionLink to={paths.library} tone="green" className="mine-card"><span className="card-symbol" aria-hidden="true">◉</span><span>我的声音库</span><span className="arrow" aria-hidden="true">→</span></ActionLink>
    </nav>
  </Page>;
}
