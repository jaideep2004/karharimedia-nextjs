"use client";

import dynamic from 'next/dynamic';
const ArtistProfileClient = dynamic(() => import('./ArtistProfileClient'), { ssr: false });

export default function Page() {
  return <ArtistProfileClient />;
}