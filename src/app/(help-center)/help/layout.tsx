import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Karhari Media Distribution Help Center',
  description: 'Operational guides and support for Karhari Media Distribution users.',
  robots: {
    index: true,
    follow: true,
  },
};

export default function HelpCenterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
