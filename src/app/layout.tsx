import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { Barlow } from "next/font/google";

import { MotionRoot } from "@/components/motion";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

// Barlow is the one typeface for text and headings: a DIN-style face, in the
// engineered manner of SpaceX's D-DIN. Geist Mono is for ids and numbers.
// See brand/README.md.
const barlow = Barlow({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-barlow",
  display: "swap",
});

export const metadata: Metadata = {
  // Where the app is served from, for absolute links in share cards.
  metadataBase: new URL(process.env.WINDTUNNEL_URL || "http://localhost:3300"),
  title: {
    default: "Windtunnel — Break it before you build it",
    template: "%s · Windtunnel",
  },
  description:
    "Windtunnel simulates an application before it is built. Five competing agents test your requirements and design and report what fails.",
};

// The root holds only what both areas share: fonts, theme and styles. The
// marketing site adds its header in (site)/layout.tsx and the product adds
// its shell in app/layout.tsx.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      id="top"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${barlow.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* Dark is the default look. The theme toggle switches it. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <MotionRoot>
            <TooltipProvider>{children}</TooltipProvider>
          </MotionRoot>
        </ThemeProvider>
      </body>
    </html>
  );
}
