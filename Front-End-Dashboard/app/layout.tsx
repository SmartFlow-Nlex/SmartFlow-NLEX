import type { Metadata } from 'next';
import './globals.css';
// Night Corridor page styles, one file per area, after the shared layer.
import './styles/nc-traffic.css';
import './styles/nc-incident.css';
import './styles/nc-emissions.css';
import './styles/nc-livemap.css';
import './styles/nc-ops.css';
import './styles/nc-sandbox.css';
import './styles/nc-admin.css';
import './styles/nc-forecast.css';
import { ThemeProvider, THEME_INIT_SCRIPT } from '../lib/theme';

const EFFECTS_INIT_SCRIPT = `(function(){try{if(localStorage.getItem('smartflow-effects')==='off')document.documentElement.setAttribute('data-effects','off');}catch(e){}})();`;
const MASCOT_INIT_SCRIPT = `(function(){try{var p=location.pathname;if(p.slice(-10)==='index.html')p=p.slice(0,-10);if(p.length>1&&p.charAt(p.length-1)==='/')p=p.slice(0,-1);if(window.WebGLRenderingContext&&(p===''||p==='/'||p.slice(-10)==='/dashboard'||p.slice(-4)==='/out')){document.documentElement.setAttribute('data-stage-mascot','pending');}}catch(e){}})();`;
import { ToastProvider } from '../lib/toast';

// Night Corridor type (Italiana for display, Outfit for the interface) is
// self-hosted through @font-face in globals.css from app/fonts. next/font was
// tried first, as the brief asked, but it refuses the production assetPrefix
// ('./') that the Electron build depends on.

export const metadata: Metadata = {
  title: 'SmartFlow NLEX — Decision Intelligence Dashboard',
  description: 'SmartFlow NLEX Decision-Intelligence dashboard for traffic monitoring, incident analysis, and AI-powered predictions.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // data-scroll-behavior declares the smooth scrolling that globals.css sets on
  // <html>. Next.js suspends it during route changes so a navigation does not
  // animate the scroll position, and warns that a future version will stop
  // doing that unless the attribute is present. Declaring it keeps today's
  // behaviour and clears the warning.
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        {/* Stamps the stored theme before first paint so a dark-theme reload
            never flashes the light palette. Must stay ahead of the stylesheet. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* On the two pages with the 3D car (sign-in and Overview), keeps the
            flat stand-in picture hidden from the first paint while the car
            loads, so the page does not show one mascot and then swap it for
            another. CSS shows the picture anyway after 6 s, and the stage
            clears the mark if it never starts. */}
        <script dangerouslySetInnerHTML={{ __html: MASCOT_INIT_SCRIPT }} />
        {/* The reader's "background effects" switch, before first paint (lib/effects.ts). */}
        <script dangerouslySetInnerHTML={{ __html: EFFECTS_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
