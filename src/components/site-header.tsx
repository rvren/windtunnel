import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";

const links = [
  { href: "#how", label: "How it works" },
  { href: "#agents", label: "Agents" },
  { href: "#standalone", label: "Standalone" },
  { href: "#roadmap", label: "Roadmap" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 bg-background/70 backdrop-blur-md">
      <div className="mx-auto grid h-16 w-full max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 sm:px-6">
        <a
          href="#top"
          aria-label="Windtunnel, back to top"
          data-testid="header-logo"
        >
          <Logo />
        </a>
        <nav
          aria-label="Sections"
          className="hidden items-center rounded-md border bg-card/50 p-1 text-sm text-muted-foreground md:flex"
        >
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              data-testid={`header-nav-${link.href.slice(1)}`}
              className="rounded-md px-3.5 py-1.5 transition-colors hover:bg-muted hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="col-start-3 flex items-center justify-end gap-2">
          <ThemeToggle />
          <Link
            href="/app"
            data-testid="header-launch-app"
            className={buttonVariants({ className: "px-4" })}
          >
            Launch app
          </Link>
        </div>
      </div>
    </header>
  );
}
