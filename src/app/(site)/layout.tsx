import { SiteHeader } from "@/components/site-header";

// The marketing site: the header with the pill nav, then the page.
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">{children}</main>
    </>
  );
}
