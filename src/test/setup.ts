import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => { cleanup(); if (typeof localStorage !== 'undefined') localStorage.clear(); });
if (typeof window !== 'undefined') Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
