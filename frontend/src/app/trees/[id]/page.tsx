import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell/PageShell";
import { PublicTreeDetail } from "@/components/PublicTreeDetail/PublicTreeDetail";

const API = process.env.INTERNAL_API_URL ?? "http://localhost:4000/api";

/**
 * Динамический title/description: имя старшего предка попадает в выдачу
 * поисковиков («Родовое древо {имя}») — люди ищут древа по фамилиям.
 */
export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const fallback: Metadata = {
    title: "Родовое древо",
    description:
      "Полное объединённое родовое древо от старшего предка к потомкам.",
    alternates: { canonical: `/trees/${params.id}` },
  };
  const id = Number(params.id);
  if (!Number.isFinite(id)) return fallback;

  try {
    const res = await fetch(`${API}/persons/${id}`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return fallback;
    const body = (await res.json()) as {
      data?: { full_name?: string; teip_name?: string | null };
    };
    const name = body.data?.full_name;
    if (!name) return fallback;
    const teip = body.data?.teip_name;
    return {
      title: `Родовое древо ${name}`,
      description: `Родовое древо от предка ${name}${teip ? ` (тейп ${teip})` : ""}: полная схема потомков, поколения и родственные связи на Vorhda.`,
      alternates: { canonical: `/trees/${params.id}` },
    };
  } catch {
    return fallback;
  }
}

export default function TreeDetailPage({ params }: { params: { id: string } }) {
  const rootId = Number(params.id);

  return (
    <PageShell
      title="Родовое древо"
      description="Полная схема объединённого древа: от самого старшего предка к потомкам."
      wide
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