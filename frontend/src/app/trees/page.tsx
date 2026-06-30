import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell/PageShell";
import { PublicTreesView } from "@/components/PublicTreesView/PublicTreesView";

export const metadata: Metadata = {
  title: "Древа — Vorhda",
  description: "Одобренные родовые древа с фильтрами по тейпу и поселению.",
};

export default function TreesPage() {
  return (
    <PageShell
      eyebrow="Дешнаш · Древа"
      title="Родовые древа"
      description="Одобренные модерацией древа. Отфильтруйте их по тейпу и поселению."
    >
      <PublicTreesView />
    </PageShell>
  );
}
