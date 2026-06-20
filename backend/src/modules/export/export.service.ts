import { getDescendants, getAncestors } from '../ancestors/ancestors.service.js';
import type { TreeNode } from '../ancestors/ancestors.service.js';

/** Плоский ряд для табличного экспорта. */
export interface ExportRow {
  id: number;
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
  father_id: number | null;
  depth: number;
}

function toRows(nodes: TreeNode[]): ExportRow[] {
  return nodes.map((n) => ({
    id: n.id,
    full_name: n.full_name,
    birth_year: n.birth_year,
    death_year: n.death_year,
    father_id: n.father_id,
    depth: n.depth,
  }));
}

/** Собрать данные дерева (потомки выбранного корня). */
export async function collectTree(rootId: number): Promise<ExportRow[]> {
  const nodes = await getDescendants(rootId, 30);
  return toRows(nodes);
}

/** Собрать предков (для экспорта линии вверх). */
export async function collectLine(personId: number): Promise<ExportRow[]> {
  const nodes = await getAncestors(personId, 30);
  return toRows(nodes);
}

/** Экранирование значения для CSV. */
function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV (открывается в Excel; разделитель ; для русской локали). */
export function toCsv(rows: ExportRow[]): string {
  const header = ['ID', 'ФИО', 'Год рождения', 'Год смерти', 'ID отца', 'Поколение'];
  const lines = [header.join(';')];
  for (const r of rows) {
    lines.push(
      [r.id, r.full_name, r.birth_year, r.death_year, r.father_id, r.depth]
        .map(csvCell)
        .join(';'),
    );
  }
  return '\uFEFF' + lines.join('\n'); // BOM для корректной кириллицы в Excel
}

/**
 * CSV в формате Microsoft Visio Data Visualizer.
 * Visio строит организационную диаграмму из колонок:
 *   ID, Name, Manager (= родитель/отец).
 * Это рекомендованный для MVP путь экспорта в Visio (см. MVP_PLAN §8).
 */
export function toVisioCsv(rows: ExportRow[]): string {
  const header = ['ID', 'Name', 'ManagerID', 'Years'];
  const lines = [header.join(',')];
  for (const r of rows) {
    const years = [r.birth_year, r.death_year].filter(Boolean).join('–');
    lines.push(
      [r.id, r.full_name, r.father_id ?? '', years].map(csvCell).join(','),
    );
  }
  return '\uFEFF' + lines.join('\n');
}
