'use client';

import { useCallback, useEffect, useState } from 'react';
import { TreeView } from '@/components/TreeView/TreeView';
import { PersonCard } from '@/components/PersonCard/PersonCard';
import { PublishControl } from '@/components/PublishControl/PublishControl';
import { RelativeAdder } from '@/components/RelativeAdder/RelativeAdder';
import { ExportButtons } from '@/features/export/ExportButtons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { BTN_SECONDARY, CARD, TOGGLE, toggleBtn } from '@/lib/ui';
import type { Person, TreeNode, Family } from '@/lib/types';

/** Краткая подпись с годами жизни. */
function years(p: { birth_year: number | null; death_year: number | null }): string {
  if (!p.birth_year && !p.death_year) return '';
  return `${p.birth_year ?? '?'} – ${p.death_year ?? ''}`.trim();
}

/** Чип-ссылка на родственника. */
function RelativeChip({ p, role }: { p: Person; role: string }) {
  const y = years(p);
  return (
    <a
      className={`inline-flex flex-col gap-0.5 rounded-[10px] border border-l-[3px] border-line bg-stone-700 px-3.5 py-2.5 no-underline transition hover:-translate-y-0.5 hover:border-gold-soft ${
        p.gender === 'f' ? 'border-l-[#c77dad]' : 'border-l-[#5a8fd6]'
      }`}
      href={`/person/${p.id}`}
    >
      <span className="text-[11px] uppercase tracking-[0.04em] text-sand">{role}</span>
      <span className="text-[15px] font-semibold text-cream">{p.full_name}</span>
      {y && <span className="text-xs text-sand">{y}</span>}
    </a>
  );
}

export default function PersonPage({ params }: { params: { id: string } }) {
  const personId = Number(params.id);
  const { user } = useAuth();
  const [person, setPerson] = useState<Person | null>(null);
  const [family, setFamily] = useState<Family | null>(null);
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [direction, setDirection] = useState<'down' | 'up'>('down');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, fam, tree] = await Promise.all([
        api.persons.get(personId),
        api.persons.family(personId).catch(() => null),
        direction === 'down'
          ? api.tree.descendants(personId)
          : api.tree.ancestors(personId),
      ]);
      setPerson(p);
      setFamily(fam);
      setNodes(tree);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    }
  }, [personId, direction]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p className="text-[#e08a7a]">{error}</p>;
  if (!person) return <p className="text-sand">Загрузка…</p>;

  const isOwner = !!user && person.created_by === user.id;
  const canEdit = !!user && (isOwner || user.role === 'teip_admin' || user.role === 'super_admin');

  const hasFamily =
    family &&
    (family.father || family.mother || family.spouses.length > 0 || family.children.length > 0);

  return (
    <div className="grid gap-5">
      <PersonCard person={person} />

      {isOwner && <PublishControl />}

      {/* Быстрое добавление родственников */}
      {canEdit && <RelativeAdder person={person} onAdded={() => void load()} />}

      {/* Семья: родители, супруги, дети */}
      {hasFamily && (
        <div className={CARD}>
          <h3 className="mb-3.5 mt-0 text-lg font-semibold text-cream">Семья</h3>
          <div className="grid gap-4">
            {(family!.father || family!.mother) && (
              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.06em] text-sand">Родители</div>
                <div className="flex flex-wrap gap-2.5">
                  {family!.father && <RelativeChip p={family!.father} role="отец" />}
                  {family!.mother && <RelativeChip p={family!.mother} role="мать" />}
                </div>
              </div>
            )}
            {family!.spouses.length > 0 && (
              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.06em] text-sand">
                  {person.gender === 'm' ? 'Жёны' : 'Мужья'}
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {family!.spouses.map((s) => (
                    <RelativeChip
                      key={s.id}
                      p={s}
                      role={s.gender === 'f' ? 'жена' : 'муж'}
                    />
                  ))}
                </div>
              </div>
            )}
            {family!.children.length > 0 && (
              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.06em] text-sand">Дети ({family!.children.length})</div>
                <div className="flex flex-wrap gap-2.5">
                  {family!.children.map((c) => (
                    <RelativeChip
                      key={c.id}
                      p={c}
                      role={c.gender === 'f' ? 'дочь' : 'сын'}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <a className={BTN_SECONDARY} href={`/person/${personId}/edit`}>
            Редактировать данные
          </a>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className={TOGGLE}>
          <button className={toggleBtn(direction === 'down')} onClick={() => setDirection('down')}>
            Потомки
          </button>
          <button className={toggleBtn(direction === 'up')} onClick={() => setDirection('up')}>
            Предки
          </button>
        </div>
        <ExportButtons personId={personId} />
      </div>

      <div className={CARD}>
        <TreeView
          nodes={nodes}
          rootId={personId}
          onSelect={(id) => (window.location.href = `/person/${id}`)}
        />
      </div>
    </div>
  );
}
