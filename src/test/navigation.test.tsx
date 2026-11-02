import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { App } from '../app/App';
import { pageCatalog, paths } from '../app/routes';

function renderPage(path: string = '/') {
  return render(<MemoryRouter initialEntries={[path]}><App /><LocationProbe /></MemoryRouter>);
}

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function HistoryControls() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate(-1)}>浏览器后退</button><button onClick={() => navigate(1)}>浏览器前进</button></>;
}

describe('阶段一 / 二：页面与导航', () => {
  it.each([
    ['发现声音', '声音邂逅'], ['开始创作', '敲击节奏'], ['我的声音', '我的声音'],
  ])('首页 %s 入口跳转并将焦点移到标题', async (link, title) => {
    renderPage();
    await userEvent.click(screen.getByRole(link === '开始创作' ? 'button' : 'link', { name: link }));
    expect(screen.getByRole('heading', { level: 1, name: title })).toHaveFocus();
  });

  it('发现声音只提供录音与拍照两个主要入口', () => {
    renderPage(paths.discover);
    const nav = screen.getByRole('navigation', { name: '发现声音的方式' });
    expect(nav.querySelectorAll('a')).toHaveLength(2);
    expect(screen.queryByRole('link', { name: '直接选择已有声音' })).not.toBeInTheDocument();
  });

  it('支持用键盘进入声音发现页面', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.tab();
    expect(screen.getByRole('link', { name: '发现声音' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('heading', { level: 1, name: '声音邂逅' })).toHaveFocus();
  });

  it('返回箭头与文字属于同一个链接', () => {
    renderPage(paths.record);
    const back = screen.getByRole('link', { name: '返回' });
    expect(back).toHaveAttribute('href', paths.discover);
    expect(back.querySelector('span')).toHaveAttribute('aria-hidden', 'true');
  });

  it.each(pageCatalog)('%s %s 可通过直接地址访问', (_id, _title, path) => {
    renderPage(path);
    expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('页面切换后保留已输入的音乐偏好', async () => {
    const user = userEvent.setup();
    renderPage(paths.prepare);
    await user.type(screen.getByRole('textbox', { name: '你希望音乐是什么感觉？' }), '安静的雨声');
    await user.click(screen.getByRole('link', { name: '返回' }));
    await user.click(screen.getByRole('button', { name: '喜欢' }));
    await user.click(screen.getByRole('button', { name: '下一步 →' }));
    expect(screen.getByRole('textbox', { name: '你希望音乐是什么感觉？' })).toHaveValue('安静的雨声');
  });

  it('录音开始前可以请求权限，结束录音不可用', () => {
    renderPage(paths.record);
    expect(screen.getByRole('button', { name: /开始录音/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /结束录音/ })).toBeDisabled();
  });

  it('音乐列表不使用 Figma 示例作为用户作品', async () => {
    renderPage(paths.works);
    expect(await screen.findByText('还没有保存的音乐')).toBeVisible();
    expect(screen.queryByText('雨天的旋律')).not.toBeInTheDocument();
  });

  it('未知地址有返回首页入口', () => {
    renderPage('/not-a-page');
    expect(screen.getByRole('link', { name: '返回首页' })).toHaveAttribute('href', '/');
  });

  it.each([
    [paths.rhythm, paths.home], [paths.discover, paths.home], [paths.select, paths.rhythm],
    [paths.prepare, paths.select], [paths.record, paths.discover], [paths.camera, paths.discover],
    [paths.composing, paths.prepare], [paths.library, paths.mine], [paths.player, paths.works],
    [paths.mine, paths.home], [paths.works, paths.mine], [paths.saved, paths.player],
    [paths.photoResult, paths.camera], [paths.recorded, paths.record], [paths.emptyLibrary, paths.mine],
  ])('%s 的完整返回区域跳转到 %s', async (from, to) => {
    renderPage(from);
    const back = within(screen.getByRole('main')).getByRole('link', { name: '返回' });
    expect(back).toHaveAttribute('href', to);
    expect(back.querySelectorAll('a, button')).toHaveLength(0);
    await userEvent.click(back);
    expect(screen.getByTestId('location')).toHaveTextContent(to);
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });

  it.each(pageCatalog)('%s %s 的控件有名称且链接目标都已注册', (_id, _name, path) => {
    renderPage(path);
    for (const control of screen.getByRole('main').querySelectorAll('button, a')) {
      expect(control).toHaveAccessibleName();
    }
    const knownPaths: string[] = pageCatalog.map(page => page[2]);
    for (const link of screen.getByRole('main').querySelectorAll('a')) {
      expect(knownPaths).toContain(new URL(link.getAttribute('href')!,'http://localhost').pathname);
    }
  });

  it('跳到主要内容入口可以直接移动键盘焦点', async () => {
    renderPage(paths.prepare);
    await userEvent.click(screen.getByRole('link', { name: '跳到主要内容' }));
    expect(screen.getByRole('main')).toHaveFocus();
    expect(screen.getByTestId('location')).toHaveTextContent(paths.prepare);
  });

  it('浏览器前进后退后重新聚焦标题，包括返回首页', async () => {
    render(<MemoryRouter><App /><HistoryControls /></MemoryRouter>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: '发现声音' }));
    await user.click(screen.getByRole('button', { name: '浏览器后退' }));
    expect(screen.getByRole('heading', { level: 1, name: '万物声' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: '浏览器前进' }));
    expect(screen.getByRole('heading', { level: 1, name: '声音邂逅' })).toHaveFocus();
  });

  it('从页面目录导航后关闭目录，避免大量预览链接干扰阅读', async () => {
    renderPage();
    const user = userEvent.setup();
    const summary = screen.getByText('界面预览 · 阶段一 / 二');
    await user.click(summary);
    expect(summary.closest('details')).toHaveAttribute('open');
    await user.click(screen.getByRole('link', { name: '07 · 拍照' }));
    expect(summary.closest('details')).not.toHaveAttribute('open');
    expect(screen.getByRole('heading', { level: 1, name: '拍照' })).toHaveFocus();
  });

  it('未经保存验证不向屏幕阅读器宣称作品已保存', () => {
    renderPage(paths.saved);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('保存结果');
    expect(screen.queryByText('作品已保存')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
