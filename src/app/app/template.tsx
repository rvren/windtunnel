import { FadeIn } from "@/components/motion";

// A template is mounted again on every navigation, so each app page eases in.
export default function AppTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <FadeIn>{children}</FadeIn>;
}
