'use client';

import { useEffect, useState } from 'react';
import { TreeView } from '@/components/TreeView/TreeView';
import { PersonCard } from '@/components/PersonCard/PersonCard';
import { PublishControl } from '@/components/PublishControl/PublishControl';
import { ExportButtons } from '@/features/export/ExportButtons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Person, TreeNode } from '@/lib/types';

export default function PersonPage({ params }: { params: { id: string } }) {
  const personId = Number(params.id);
  const { user } = useAuth();
  const [person, setPerson] = useState<Person | null>(null);
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [direction, setDirection] = useState<'down' | 'up'>('down');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [p, tree] = await Promise.all([
          api.persons.get(personId),
          direction === 'down'
            ? api.tree.descendants(personId)
            : api.tree.ancestors(personId),
        ]);
        if (!active) return;
        setPerson(p);
        setNodes(tree);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      }
    })();
    return () => {
      active = false;
    };
  }, [personId, direction]);

  if (error) return <p style={{ color: '#dc2626' }}>{error}</p>;
  if (!person) return <p>Загрузка…</p>;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <PersonCard person={person} />

      {user && person.created_by === user.id && <PublishControl />}

      {user && (
        <div className="actions">
          <a className="btn-primary" href={`/persons/new?father=${personId}`}>
            + Добавить сына / дочь
          </a>
          {!person.father_id && (
            <a className="btn-secondary" href={`/persons/new?child=${personId}`}>
              + Указать отца
            </a>
          )}
          <a className="btn-secondary" href={`/person/${personId}/edit`}>
            Редактировать
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
