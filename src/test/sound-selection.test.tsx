import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { App } from '../app/App';
import { builtinSounds } from '../services/sounds/catalog';
import { chooseSound, createGroup, nextCard } from '../services/sounds/selection';

function setup() {
  render(<MemoryRouter initialEntries={['/sounds/select']}><App /></MemoryRouter>);
  const user = userEvent.setup();
  const card = () => screen.getByRole('region', { name: '声音卡片' });
  const name = () => within(card()).getByRole('heading').textContent;
  const like = () => user.click(screen.getByRole('button', { name: '喜欢' }));
  const dislike = () => user.click(screen.getByRole('button', { name: '不喜欢' }));
  return { user, card, name, like, dislike };
}
describe('声音选择', () => {
  it('喜欢增加数量、不喜欢跳过、六张后回到第一张且不更换组', async () => {
    const { like, dislike, name, card } = setup();
    const first = name();
    const names = [first];
    await like();
    expect(screen.getByRole('status')).toHaveTextContent('已选择 1 个');
    names.push(name());
    for (let i = 0; i < 5; i++) { await dislike(); if (i < 4) names.push(name()); }
    expect(new Set(names).size).toBe(6);
    expect(name()).toBe(first);
    expect(card()).toHaveTextContent('1 / 6 · 已选择');
    expect(screen.getByRole('status')).toHaveTextContent('已选择 1 个');
    for (let i = 0; i < 6; i++) { expect(name()).toBe(names[i]); await like(); }
    expect(screen.getByRole('status')).toHaveTextContent('已选择 6 个');
    await like();
    expect(screen.getByRole('status')).toHaveTextContent('已选择 6 个');
  });
  it('不喜欢取消此前选择', async () => {
    const { like, dislike } = setup();
    await like();
    for (let i = 0; i < 5; i++) await dislike();
    await dislike();
    expect(screen.getByRole('status')).toHaveTextContent('已选择 0 个');
  });
  it('换组得到不同的六个声音，重置序号并保留已选声音，下一步展示真实素材', async () => {
    const { user, name, like, dislike, card } = setup();
    const selected = name();
    const old = [selected];
    await like();
    for (let i = 0; i < 5; i++) { old.push(name()); await dislike(); }
    await user.click(screen.getByRole('button', { name: /换一组/ }));
    expect(card()).toHaveTextContent('1 / 6');
    const changed = [];
    for (let i = 0; i < 6; i++) { changed.push(name()); await like(); }
    expect(new Set(changed).size).toBe(6);
    expect(changed.some(id => !old.includes(id))).toBe(true);
    await user.click(screen.getByRole('button', { name: /下一步/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'AI编曲' })).toHaveFocus();
    expect(screen.getByRole('button', { name: `试听${selected}` })).toBeEnabled();
    await user.click(screen.getByRole('link', { name: '返回' }));
    expect(name()).toBe(changed[0]);
  });
  it('未选择时阻止下一步并提示，键盘可操作喜欢', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /下一步/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('请至少选择一个声音');
    expect(screen.getByRole('heading', { level: 1, name: '选择声音' })).toBeVisible();
    screen.getByRole('button', { name: '喜欢' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent('已选择 1 个');
  });
  it('不足六个时以内置素材补齐，去重且连续换组避免同组六个', () => {
    const first = createGroup([], [], () => .5);
    expect(first).toHaveLength(6);
    expect(new Set(first).size).toBe(6);
    const second = createGroup([builtinSounds[0], builtinSounds[0]], first, () => .5);
    expect(second.some(id => !first.includes(id))).toBe(true);
    expect(chooseSound(['a'], 'a', true)).toEqual(['a']);
    expect(chooseSound(['a'], 'a', false)).toEqual([]);
    expect(nextCard(5)).toBe(0);
  });
});
