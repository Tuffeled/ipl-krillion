import type { Metadata, Viewport } from 'next';
import { VT323 } from 'next/font/google';
import './globals.css';

const pixel = VT323({ weight: '400', subsets: ['latin'], variable: '--font-pixel' });

export const metadata: Metadata = { title: 'IPL Krillion', description: 'Seven IPL questions a day. Name the rare players and hit it further.' };
// resizes-content keeps the answer box above the on-screen keyboard on Android.
export const viewport: Viewport = { themeColor: '#060b1a', width: 'device-width', initialScale: 1, viewportFit: 'cover', interactiveWidget: 'resizes-content' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={pixel.variable}><body>{children}</body></html>;
}
