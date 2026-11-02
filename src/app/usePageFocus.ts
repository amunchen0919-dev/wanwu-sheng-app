import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

// 以路由条目为基准：同一页面的重新访问、浏览器前进 / 后退也会管理焦点。
// 标题聚焦本身已让 VoiceOver 播报页面名称，避免再用 live region 重复播报。
export function usePageFocus(title: string) {
  const heading = useRef<HTMLHeadingElement>(null);
  const { key } = useLocation();
  useEffect(() => {
    document.title = `${title} · 万物声`;
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [title, key]);
  return heading;
}
