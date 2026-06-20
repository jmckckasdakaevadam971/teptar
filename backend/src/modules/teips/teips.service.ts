import { query } from '../../db/pool.js';

export interface TeipRow {
  id: number;
  tukhum_id: number | null;
  name: string;
  description: string | null;
  tukhum_name?: string | null;
}

export interface GarRow {
  id: number;
  teip_id: number;
  name: string;
  description: string | null;
}

export async function listTeips(): Promise<TeipRow[]> {
  return query<TeipRow>(
    `SELECT t.*, tk.name AS tukhum_name
     FROM teips t
     LEFT JOIN tukhums tk ON tk.id = t.tukhum_id
     ORDER BY t.name`,
  );
}

export async function getTeip(id: number): Promise<TeipRow | undefined> {
  const rows = await query<TeipRow>('SELECT * FROM teips WHERE id = $1', [id]);
  return rows[0];
}

export async function listGars(teipId: number): Promise<GarRow[]> {
  return query<GarRow>('SELECT * FROM gars WHERE teip_id = $1 ORDER BY name', [teipId]);
}

export async function createTeip(
  name: string,
  description: string | null,
  tukhumId: number | null,
): Promise<TeipRow> {
  const rows = await query<TeipRow>(
    `INSERT INTO teips (name, description, tukhum_id) VALUES ($1,$2,$3) RETURNING *`,
    [name, description, tukhumId],
  );
  return rows[0];
}

/** Статистика по тейпу: сколько персон внесено. */
export async function teipStats(id: number): Promise<{ persons: number }> {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM persons WHERE teip_id = $1 AND status = 'approved'`,
    [id],
  );
  return { persons: Number(rows[0]?.count ?? 0) };
}
