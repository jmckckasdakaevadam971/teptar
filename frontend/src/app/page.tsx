'use client';

import { useState } from 'react';
import { SearchBar } from '@/components/SearchBar/SearchBar';
import { PersonCard } from '@/components/PersonCard/PersonCard';
import { CommonAncestorWidget } from '@/features/commonAncestor/CommonAncestorWidget';
import { api } from '@/lib/api';
import type { Person } from '@/lib/types';

export default function HomePage() {
  const [results, setResults] = useState<Person[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(q: string) {
    setError(null);
    setSearched(true);
    try {
      setResults(await api.persons.search({ q }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка поиска');
    }
  }

  function openTree(id: number) {
    window.location.href = `/person/${id}`;
  }

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <section>
        <h1>Родословные чеченских тейпов</h1>
        <p style={{ color: '#64748b' }}>
          Найдите человека, постройте древо и узнайте общих предков.
        </p>
        <SearchBar onSearch={handleSearch} />
        <div style={{ marginTop: 12 }}>
          <a className="btn-secondary" href="/persons/new">
            + Добавить человека в древо
          </a>
        </div>
      </section>

      <CommonAncestorWidget />

      <section>
        {error && <p style={{ color: '#dc2626' }}>{error}</p>}
        {searched && results.length === 0 && !error && <p>Ничего не найдено.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
          {results.map((p) => (
            <PersonCard key={p.id} person={p} onOpenTree={openTree} />
          ))}
        </div>
      </section>
    </div>
  );
}
