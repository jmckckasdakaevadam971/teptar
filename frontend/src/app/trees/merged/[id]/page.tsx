import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell/PageShell";
import { PublicTreeDetail } from "@/components/PublicTreeDetail/PublicTreeDetail";

export const metadata: Metadata = {
  title: "Общее древо — Vorhda",
  description:
    "Объединённое общее древо: две ветки, сведённые по общему предку.",
};

export default function MergedTreePage({ params }: { params: { id: string } }) {
  const mergeId = Number(params.id);

  return (
    <PageShell
      eyebrow="Дешнаш · Общее древо"
      title="Общее родовое древо"
      description="Две ветки, сведённые по общему предку. Исходные древа обоих хранителей остаются неизменными."
    >
      {Number.isFinite(mergeId) ? (
        <PublicTreeDetail mergeId={mergeId} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Некорректный адрес древа.
        </p>
      )}
    </PageShell>
  );
}
