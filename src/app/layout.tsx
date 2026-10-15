import type { Metadata, Viewport } from "next";
import "./global.css";
import { WebsiteLoader } from "./website-loader";

export const viewport: Viewport = {
  themeColor: "#0A1118",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "ExamMate | Build your exam table in minutes",
  applicationName: "ExamMate",
  description:
    "Find your exact exam dates and times from the official university routine. Export a clean schedule or sync with Google Calendar in seconds.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  verification: {
    google: "cwxA_7eQGZh2sP-o-oefpqBvNhe90rd5ts3z-twR_KQ",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var p = window.location.pathname;
                var nav = window.performance && window.performance.getEntriesByType && window.performance.getEntriesByType('navigation')[0];
                var isReload = nav && nav.type === 'reload';
                var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
                var isSlow = conn && (conn.saveData || conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g' || conn.effectiveType === '3g');
                if ((isReload || isSlow) && p === '/') {
                  document.documentElement.classList.add('app-loading');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body>
        <WebsiteLoader />
        {children}
      </body>
    </html>
  );
}

