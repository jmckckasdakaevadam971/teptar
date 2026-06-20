import { query, withTransaction } from '../../db/pool.js';
import { ApiError } from '../../utils/http.js';
import type {
  PersonRow,
  CreatePersonInput,
  UpdatePersonInput,
  ListPersonsQuery,
} from './persons.types.js';

/** Поиск и листинг персон с фильтрами. */
export async function listPersons(params: ListPersonsQuery): Promise<PersonRow[]> {
  const where: string[] = [];
  const args: unknown[] = [];

  if (params.q) {
    args.push(`%${params.q}%`);
    where.push(`full_name ILIKE $${args.length}`);
  }
  if (params.teip_id) {
    args.push(params.teip_id);
    where.push(`teip_id = $${args.length}`);
  }
  if (params.village_id) {
    args.push(params.village_id);
    where.push(`village_id = $${args.length}`);
  }
  if (params.status) {
    args.push(params.status);
    where.push(`status = $${args.length}`);
  }

  args.push(params.limit, params.offset);
  const sql = `
    SELECT * FROM persons
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY full_name
    LIMIT $${args.length - 1} OFFSET $${args.length}
  `;
  return query<PersonRow>(sql, args);
}

/** Получить персону по id. */
export async function getPerson(id: number): Promise<PersonRow> {
  const rows = await query<PersonRow>('SELECT * FROM persons WHERE id = $1', [id]);
  if (rows.length === 0) throw new ApiError(404, 'Человек не найден');
  return rows[0];
}

/**
 * Проверка на цикл: новый отец/мать не должен быть потомком ребёнка.
 * Иначе образуется петля в графе родства.
 */
async function assertNoCycle(childId: number, parentId: number): Promise<void> {
  const rows = await query<{ id: number }>(
    `
    WITH RECURSIVE descendants AS (
      SELECT id FROM persons WHERE id = $1
      UNION ALL
      SELECT p.id FROM persons p
      JOIN descendants d ON p.father_id = d.id OR p.mother_id = d.id
    )
    SELECT id FROM descendants WHERE id = $2
    `,
    [childId, parentId],
  );
  if (rows.length > 0) {
    throw new ApiError(409, 'Нельзя назначить потомка родителем (цикл в родстве)');
  }
}

/** Создать персону (статус pending, если не админ). */
export async function createPerson(
  input: CreatePersonInput,
  userId: number | null,
  autoApprove: boolean,
): Promise<PersonRow> {
  return withTransaction(async (client) => {
    const status = autoApprove ? 'approved' : 'pending';
    const result = await client.query<PersonRow>(
      `
      INSERT INTO persons
        (full_name, gender, birth_year, death_year,
         father_id, mother_id, teip_id, gar_id, village_id,
         note, status, created_by, approved_by, is_alive)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
      `,
      [
        input.full_name,
        input.gender ?? 'm',
        input.birth_year ?? null,
        input.death_year ?? null,
        input.father_id ?? null,
        input.mother_id ?? null,
        input.teip_id ?? null,
        input.gar_id ?? null,
        input.village_id ?? null,
        input.note ?? null,
        status,
        userId,
        autoApprove ? userId : null,
        input.death_year == null,
      ],
    );

    await client.query(
      `INSERT INTO change_log (person_id, user_id, action, diff)
       VALUES ($1, $2, 'create', $3)`,
      [result.rows[0].id, userId, JSON.stringify(input)],
    );

    return result.rows[0];
  });
}

/** Обновить персону. */
export async function updatePerson(
  id: number,
  input: UpdatePersonInput,
  userId: number | null,
): Promise<PersonRow> {
  await getPerson(id); // проверка существования

  if (input.father_id) await assertNoCycle(id, input.father_id);
  if (input.mother_id) await assertNoCycle(id, input.mother_id);

  const fields: string[] = [];
  const args: unknown[] = [];
  for (const [key, value] of Object.entries(input)) {
    args.push(value);
    fields.push(`${key} = $${args.length}`);
  }
  if (fields.length === 0) return getPerson(id);

  args.push(id);
  const rows = await query<PersonRow>(
    `UPDATE persons SET ${fields.join(', ')} WHERE id = $${args.length} RETURNING *`,
    args,
  );

  await query(
    `INSERT INTO change_log (person_id, user_id, action, diff)
     VALUES ($1, $2, 'update', $3)`,
    [id, userId, JSON.stringify(input)],
  );

  return rows[0];
}

/** Удалить персону. */
export async function deletePerson(id: number): Promise<void> {
  const rows = await query('DELETE FROM persons WHERE id = $1 RETURNING id', [id]);
  if (rows.length === 0) throw new ApiError(404, 'Человек не найден');
}
