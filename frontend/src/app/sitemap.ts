import type { MetadataRoute } from "next";

/**
 * Динамическая карта сайта (/sitemap.xml).
 *
 * Статические разделы дополняются опубликованными древами и общими
 * (объединёнными) древами из API. Внутри Docker фронтенд ходит к бэкенду
 * напрямую (INTERNAL_API_URL=http://backend:4000/api), т.к. публичный
 * NEXT_PUBLIC_API_URL=/api — относительный и работает только в браузере.
 * Результат кэшируется на час.
 */
const SITE = "https://vorhda.ru";
const API = process.env.INTERNAL_API_URL ?? "http://localhost:4000/api";

// force-dynamic: иначе sitemap пререндерится при docker build, когда backend
// недоступен, и навсегда остаётся без древ. Кэш обеспечивает fetch-revalidate.
export const dynamic = "force-dynamic";

interface PublicTreeLite {
  root_person_id: number | null;
}
interface TreeMergeLite {
  id: number;
}

async function fetchData<T>(path: string): Promise<T[]> {
  try {
    const res = await fetch(`${API}${path}`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { success?: boolean; data?: T[] };
    return Array.isArray(body.data) ? body.data : [];
  } catch {
    // API недоступен — карта сайта отдаётся со статическими разделами.
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE, lastModified: now, changeFrequency: "daily", priority: 1 },
    {
      url: `${SITE}/reference`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE}/trees`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE}/keepers`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE}/keepers/apply`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${SITE}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];

  const [trees, merges] = await Promise.all([
    fetchData<PublicTreeLite>("/persons/trees/public"),
    fetchData<TreeMergeLite>("/persons/trees/merged"),
  ]);

  const treePages: MetadataRoute.Sitemap = trees
    .filter((t) => t.root_person_id !== null)
    .map((t) => ({
      url: `${SITE}/trees/${t.root_person_id}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));

  const mergePages: MetadataRoute.Sitemap = merges.map((m) => ({
    url: `${SITE}/trees/merged/${m.id}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  return [...staticPages, ...treePages, ...mergePages];
}
