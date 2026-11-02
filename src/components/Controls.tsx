import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';

type Tone = 'mint' | 'surface' | 'light' | 'green';
export function ActionLink({ to, children, tone = 'mint', className = '' }: {
  to: string; children: ReactNode; tone?: Tone; className?: string;
}) {
  return <Link to={to} className={`action ${tone} ${className}`}>{children}</Link>;
}

export function ActionButton({ children, tone = 'mint', className = '', ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return <button type="button" className={`action ${tone} ${className}`} {...props}>{children}</button>;
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="panel"><h2>{title}</h2>{children}</section>;
}
