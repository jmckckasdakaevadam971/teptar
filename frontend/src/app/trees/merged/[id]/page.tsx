import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell/PageShell";
import { PublicTreeDetail } from "@/components/PublicTreeDetail/PublicTreeDetail";

const API = process.env.INTERNAL_API_URL ?? "http://localhost:4000/api";

/** Динамический title: имя общего предка объединённого древа в выдаче. */
export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const fallback: Metadata = {
    title: "Общее древо",
    description:
      "Объединённое общее древо: две ветки, сведённые по общему предку.",
    alternates: { canonical: `/trees/merged/${params.id}` },
  };
  const id = Number(params.id);
  if (!Number.isFinite(id)) return fallback;

  try {
    const res = await fetch(`${API}/persons/trees/merged`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return fallback;
    const body = (await res.json()) as {
      data?: { id: number; merged_name?: string; root_name?: string }[];
    };
    const merge = body.data?.find((m) => m.id === id);
    const name = merge?.root_name || merge?.merged_name;
    if (!name) return fallback;
    return {
      title: `Общее родовое древо ${name}`,
      description: `Объединённое родовое древо ${name}: семейные ветви нескольких хранителей, сведённые в одно древо от первопредка на Vorhda.`,
      alternates: { canonical: `/trees/merged/${params.id}` },
    };
  } catch {
    return fallback;
  }
}

export default function MergedTreePage({ params }: { params: { id: string } }) {
  const mergeId = Number(params.id);

  return (
    <PageShell
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