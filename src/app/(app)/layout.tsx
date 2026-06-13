import { AppShell } from "@/components/app-shell";

// Wraps every authenticated route in the sidebar + top-bar chrome.
// /login lives outside this group so it renders standalone.
export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
