import type { ReactNode } from "react";
import type { Metadata } from "next";

// Служебная страница: не индексируется поисковиками.
export const metadata: Metadata = {
  title: "Администрирование",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
