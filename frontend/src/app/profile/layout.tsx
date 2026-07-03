import type { ReactNode } from "react";
import type { Metadata } from "next";

// Служебная страница: не индексируется поисковиками.
export const metadata: Metadata = {
  title: "Профиль",
  robots: { index: false, follow: false },
};

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return children;
}
