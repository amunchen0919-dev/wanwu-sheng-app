import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { paths } from '../app/routes';
import { usePageFocus } from '../app/usePageFocus';

export function Page({ title, back = paths.home, children, className = '', subtitle, trailing, previewOnly = false }: {
  title: string; back?: string; children: ReactNode; className?: string;
  subtitle?: string; trailing?: ReactNode; previewOnly?: boolean;
}) {
  const heading = usePageFocus(title);
  return <main id="main" tabIndex={-1} aria-labelledby="page-title" className={`page ${className}`}>
    <header className="page-top"><Link className="back" to={back}><span aria-hidden="true">‹</span>返回</Link>{trailing}</header>
    <h1 id="page-title" ref={heading} tabIndex={-1} aria-describedby={previewOnly ? 'preview-notice' : undefined}>{title}</h1>
    {subtitle && <p className="subtitle">{subtitle}</p>}
    {children}
  </main>;
}
