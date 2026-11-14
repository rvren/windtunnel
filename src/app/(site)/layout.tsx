// The marketing site: a full-screen deck with its own top bar.
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return <main className="flex-1">{children}</main>;
}
