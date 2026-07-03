import type { ReactNode } from "react";
import type { Metadata } from "next";

// Страница входа: не индексируется поисковиками.
export const metadata: Metadata = {
  title: "Вход и регистрация",
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
