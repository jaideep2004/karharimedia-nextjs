'use client';

import { usePathname } from 'next/navigation';
import HelpCopyrightFooter from '@/components/knowledge-base/HelpCopyrightFooter';

export default function GlobalFooter() {
  const pathname = usePathname();
  const hidden =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/admin-login');

  if (hidden) return null;

  return <HelpCopyrightFooter />;
}
