'use client';

import { useCallback, useEffect, useState } from 'react';
import { TreeView } from '@/components/TreeView/TreeView';
import { PersonCard } from '@/components/PersonCard/PersonCard';
import { PublishControl } from '@/components/PublishControl/PublishControl';
import { RelativeAdder } from '@/components/RelativeAdder/RelativeAdder';
import { ExportButtons } from '@/features/export/ExportButtons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
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
    <a className={`relchip ${p.gender === 'f' ? 'f' : 'm'}`} href={`/person/${p.id}`}>
      <span className="relchip-role">{role}</span>
      <span className="relchip-name">{p.full_name}</span>
      {y && <span className="relchip-years">{y}</span>}
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

  if (error) return <p style={{ color: '#e08a7a' }}>{error}</p>;
  if (!person) return <p>Загрузка…</p>;

  const isOwner = !!user && person.created_by === user.id;
  const canEdit = !!user && (isOwner || user.role === 'teip_admin' || user.role === 'super_admin');

  const hasFamily =
    family &&
    (family.father || family.mother || family.spouses.length > 0 || family.children.length > 0);

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <PersonCard person={person} />

      {isOwner && <PublishControl />}

      {/* Быстрое добавление родственников */}
      {canEdit && <RelativeAdder person={person} onAdded={() => void load()} />}

      {/* Семья: родители, супруги, дети */}
      {hasFamily && (
        <div className="card">
          <h3 className="family-title">Семья</h3>
          <div className="family-grid">
            {(family!.father || family!.mother) && (
              <div className="family-group">
                <div className="family-group-label">Родители</div>
                <div className="family-chips">
                  {family!.father && <RelativeChip p={family!.father} role="отец" />}
                  {family!.mother && <RelativeChip p={family!.mother} role="мать" />}
                </div>
              </div>
            )}
            {family!.spouses.length > 0 && (
              <div className="family-group">
                <div className="family-group-label">
                  {person.gender === 'm' ? 'Жёны' : 'Мужья'}
                </div>
                <div className="family-chips">
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
              <div className="family-group">
                <div className="family-group-label">Дети ({family!.children.length})</div>
                <div className="family-chips">
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
        <div className="actions">
          <a className="btn-secondary" href={`/person/${personId}/edit`}>
            Редактировать данные
          </a>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="toggle">
          <button
            className={direction === 'down' ? 'active' : ''}
            onClick={() => setDirection('down')}
          >
            Потомки
          </button>
          <button
            className={direction === 'up' ? 'active' : ''}
            onClick={() => setDirection('up')}
          >
            Предки
          </button>
        </div>
        <ExportButtons personId={personId} />
      </div>

      <div className="card">
        <TreeView
          nodes={nodes}
          rootId={personId}
          onSelect={(id) => (window.location.href = `/person/${id}`)}
        />
      </div>
    </div>
  );
}
