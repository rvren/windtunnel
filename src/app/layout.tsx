import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { Sora } from "next/font/google";

import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

// Sora is the one typeface for text and headings. Geist Mono is for labels
// and code. See brand/README.md.
const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Windtunnel — Break it before you build it",
    template: "%s · Windtunnel",
  },
  description:
    "Windtunnel simulates an application before it is built. Five competing agents test your requirements and design and report what fails.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      id="top"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${sora.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* Dark is the default look. The toggle in the header switches it. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <SiteHeader />
          <main className="flex-1">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
