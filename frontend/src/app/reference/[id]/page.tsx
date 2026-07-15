import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell/PageShell";
import { TeipDetail } from "@/components/TeipDetail/TeipDetail";

const API = process.env.INTERNAL_API_URL ?? "http://localhost:4000/api";

interface TeipData {
  name?: string;
  description?: string | null;
  tukhum_name?: string | null;
}

async function fetchTeip(id: number): Promise<TeipData | null> {
  try {
    const res = await fetch(`${API}/teips/${id}`, {
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: TeipData };
    return body.data ?? null;
  } catch {
    return null;
  }
}

/** Динамический title: «Тейп {название}» — люди ищут тейпы по названию. */
export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const fallback: Metadata = {
    title: "Тейп",
    description: "Сведения о чеченском тейпе: история и известные личности.",
    alternates: { canonical: `/reference/${params.id}` },
  };
  const id = Number(params.id);
  if (!Number.isFinite(id)) return fallback;

  const teip = await fetchTeip(id);
  if (!teip?.name) return fallback;
  return {
    title: `Тейп ${teip.name}`,
    description: `Тейп ${teip.name}${teip.tukhum_name ? ` (тукхум ${teip.tukhum_name})` : ""}: сведения о роде, место основания и исторические личности на Vorhda.`,
    alternates: { canonical: `/reference/${params.id}` },
  };
}

export default async function TeipPage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);
  const teip = Number.isFinite(id) ? await fetchTeip(id) : null;

  return (
    <PageShell
      title={teip?.name ? `Тейп ${teip.name}` : "Тейп"}
      description={teip?.tukhum_name ? `Тукхум ${teip.tukhum_name}` : undefined}
    >
      {Number.isFinite(id) ? (
        <TeipDetail teipId={id} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Некорректный адрес тейпа.
        </p>
      )}
    </PageShell>
  );
}
