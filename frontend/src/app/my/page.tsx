import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell/PageShell";
import { MyTreeClient } from "@/components/MyTreeClient/MyTreeClient";
import { BranchAccessInbox } from "@/components/BranchAccess/BranchAccessInbox";

export const metadata: Metadata = {
  title: "Моё древо — Vorhda",
  description:
    "Интерактивная схема родового древа: поколения, связи и сведения о каждом предке.",
  robots: { index: false, follow: false },
};

export default function MyTreePage() {
  return (
    <PageShell
      eyebrow="Дезал · Родовое древо"
      title="Моё древо"
      description="Создайте родовое древо и начните с самого старшего предка, о котором у вас есть сведения."
      wide
    >
      <div className="mb-6">
        <BranchAccessInbox />
      </div>
      <MyTreeClient />
    </PageShell>
  );
}
