'use client';

import { useRef, useState } from 'react';
import { HeroScene } from '@/components/HeroScene/HeroScene';
import { PersonCard } from '@/components/PersonCard/PersonCard';
import { CommonAncestorWidget } from '@/features/commonAncestor/CommonAncestorWidget';
import { api } from '@/lib/api';
import type { Person } from '@/lib/types';

const STATS = [
  { num: '136', lbl: 'тейпов' },
  { num: '9', lbl: 'тукхумов' },
  { num: '283', lbl: 'села' },
  { num: '∞', lbl: 'поколений' },
];

const FEATURES = [
  {
    title: 'Древо рода',
    text: 'Постройте генеалогическое древо своей семьи и сохраните его для потомков.',
    icon: (
      <path d="M12 2v8m0 0L6 14m6-4l6 4M6 14v6m12-6v6M4 22h4m8 0h4M10 22h4" />
    ),
  },
  {
    title: 'Общий предок',
    text: 'Найдите общего предка двух человек и узнайте, как связаны ваши рода.',
    icon: <path d="M12 3v6m0 0l-5 4m5-4l5 4M5 13v4a2 2 0 002 2h10a2 2 0 002-2v-4" />,
  },
  {
    title: 'Справочник',
    text: 'Тейпы, тукхумы и сёла Чечни в едином структурированном справочнике.',
    icon: <path d="M4 5a2 2 0 012-2h12a2 2 0 012 2v14l-4-2-4 2-4-2-4 2V5z" />,
  },
];

export default function HomePage() {
  const [results, setResults] = useState<Person[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  async function handleSearch(q: string) {
    if (!q) return;
    setError(null);
    setSearched(true);
    try {
      setResults(await api.persons.search({ q }));
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка поиска');
    }
  }

  function openTree(id: number) {
    window.location.href = `/person/${id}`;
  }

  return (
    <div style={{ display: 'grid', gap: 0 }}>
      {/* ── HERO ── */}
      <section className="hero-full">
        <HeroScene />
        <div className="hero-grain" />
        <div className="container hero-overlay">
          <div className="eyebrow">Ворх Да · Семь Отцов</div>
          <h1 className="hero-title">
            Родовая память<br />
            <span>чеченских тейпов</span>
          </h1>
          <p className="hero-lead">
            Найдите человека, постройте древо и узнайте общих предков —
            всё в одном месте.
          </p>
          <form
            className="hero-search"
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch((inputRef.current?.value ?? '').trim());
            }}
          >
            <input ref={inputRef} type="text" placeholder="Поиск по ФИО…" aria-label="Поиск" />
            <button type="submit" aria-label="Найти">→</button>
          </form>
          <div className="hero-actions">
            <a className="btn-primary" href="/persons/new">+ Добавить человека</a>
            <a className="btn-secondary" href="/tree">Смотреть древо</a>
          </div>
        </div>
      </section>

      {/* ── СТАТИСТИКА ── */}
      <section style={{ marginTop: 36, marginBottom: 12 }}>
        <div className="stats">
          {STATS.map((s) => (
            <div className="stat" key={s.lbl}>
              <div className="num">{s.num}</div>
              <div className="lbl">{s.lbl}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── РЕЗУЛЬТАТЫ ПОИСКА ── */}
      <div ref={resultsRef}>
        {error && <p style={{ color: '#f08a7a', marginTop: 24 }}>{error}</p>}
        {searched && results.length === 0 && !error && (
          <p style={{ marginTop: 24 }}>Ничего не найдено.</p>
        )}
        {results.length > 0 && (
          <section style={{ marginTop: 32 }}>
            <h2 className="section-title">Результаты</h2>
            <div className="divider">◆</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))',
                gap: 16,
              }}
            >
              {results.map((p) => (
                <PersonCard key={p.id} person={p} onOpenTree={openTree} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ── ОБЩИЙ ПРЕДОК ── */}
      <section style={{ marginTop: 48 }}>
        <CommonAncestorWidget />
      </section>

      {/* ── ВОЗМОЖНОСТИ ── */}
      <section className="panel-dark" style={{ marginTop: 56 }}>
        <div className="container">
          <h2 className="section-title">Возможности</h2>
          <div className="divider">◆</div>
          <div className="features">
            {FEATURES.map((f) => (
              <div className="feature" key={f.title}>
                <svg
                  className="ic"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {f.icon}
                </svg>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
