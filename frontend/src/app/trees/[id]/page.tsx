import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell/PageShell";
import { PublicTreeDetail } from "@/components/PublicTreeDetail/PublicTreeDetail";

export const metadata: Metadata = {
  title: "Древо — Vorhda",
  description:
    "Полное объединённое родовое древо от старшего предка к потомкам.",
};

export default function TreeDetailPage({ params }: { params: { id: string } }) {
  const rootId = Number(params.id);

  return (
    <PageShell
      eyebrow="Дешнаш · Древо"
      title="Родовое древо"
      description="Полная схема объединённого древа: от самого старшего предка к потомкам."
    >
      {Number.isFinite(rootId) ? (
        <PublicTreeDetail rootId={rootId} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Некорректный адрес древа.
        </p>
      )}
    </PageShell>
  );
}
