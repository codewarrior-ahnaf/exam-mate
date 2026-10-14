import type { Metadata } from "next";
import "./global.css";

export const metadata: Metadata = {
  title: "ExamMate | Build your exam table in minutes",
  applicationName: "ExamMate",
  description:
    "Upload your routine, match your courses, and build a clean exam table in minutes.",
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
    <html lang="en">
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
      </head>
      <body>{children}</body>
    </html>
  );
}
