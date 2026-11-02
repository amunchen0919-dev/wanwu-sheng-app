import { Page } from '../components/Page';
import { ActionButton, ActionLink } from '../components/Controls';
import { paths } from '../app/routes';

export function Camera() {
  return <Page title="拍照" back={paths.discover} className="camera-page">
    <div className="viewfinder"><div><p>将物品放在画面中央</p><span aria-hidden="true">▣</span></div></div>
    <button type="button" className="shutter" disabled aria-label="拍照（尚未接入摄像头）"><span /></button>
  </Page>;
}

export function PhotoResult() {
  return <Page title="识别结果" back={paths.camera} className="photo-result-page" previewOnly>
    <div className="photo-result"><span aria-hidden="true">▣</span><h2>尚未拍摄照片</h2></div>
    <p className="center muted">可以用它来寻找或录制声音</p>
    <ActionButton disabled>使用这个声音 →</ActionButton>
    <ActionLink to={paths.camera} tone="surface">重新拍摄</ActionLink>
  </Page>;
}

