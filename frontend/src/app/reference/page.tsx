'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { Teip, Tukhum, Village } from '@/lib/types';

type Tab = 'teips' | 'villages';
type ExtantFilter = 'all' | 'extant' | 'extinct';

export default function ReferencePage() {
  const [tab, setTab] = useState<Tab>('teips');

  // Тукхумы и тейпы
  const [tukhums, setTukhums] = useState<Tukhum[]>([]);
  const [openTukhum, setOpenTukhum] = useState<number | null>(null);
  const [teipsCache, setTeipsCache] = useState<Record<number, Teip[]>>({});

  // Сёла
  const [villages, setVillages] = useState<Village[]>([]);
  const [q, setQ] = useState('');
  const [extant, setExtant] = useState<ExtantFilter>('all');

  useEffect(() => {
    api.tukhums.list().then(setTukhums).catch(() => undefined);
    api.villages.list().then(setVillages).catch(() => undefined);
  }, []);

  async function toggleTukhum(id: number) {
    if (openTukhum === id) {
      setOpenTukhum(null);
      return;
    }
    setOpenTukhum(id);
    if (!teipsCache[id]) {
      try {
        const list = await api.tukhums.teips(id);
        setTeipsCache((prev) => ({ ...prev, [id]: list }));
      } catch {
        /* ignore */
      }
    }
  }

  // Сёла, сгруппированные по району с учётом фильтров.
  const villagesByDistrict = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtered = villages.filter((v) => {
      if (extant === 'extant' && !v.is_extant) return false;
      if (extant === 'extinct' && v.is_extant) return false;
      if (term && !v.name.toLowerCase().includes(term)) return false;
      return true;
    });
    const groups = new Map<string, Village[]>();
    for (const v of filtered) {
      const key = v.district ?? 'Прочие';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(v);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'));
  }, [villages, q, extant]);

  const totalShown = villagesByDistrict.reduce((n, [, list]) => n + list.length, 0);

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <section>
        <h1>Справочник Чеченской Республики</h1>
        <p className="ref-sub" style={{ marginTop: 0 }}>
          Тукхумы, тейпы, гары и некъи; населённые пункты — действующие и
          исторические.
        </p>
        <div className="tabs">
          <button className={tab === 'teips' ? 'active' : ''} onClick={() => setTab('teips')}>
            Тукхумы и тейпы ({tukhums.reduce((n, t) => n + t.teip_count, 0)})
          </button>
          <button className={tab === 'villages' ? 'active' : ''} onClick={() => setTab('villages')}>
            Населённые пункты ({villages.length})
          </button>
        </div>
      </section>

      {tab === 'teips' && (
        <section style={{ display: 'grid', gap: 10 }}>
          {tukhums.map((tk) => (
            <div key={tk.id} className="card" style={{ padding: 0 }}>
              <button
                type="button"
                onClick={() => toggleTukhum(tk.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 18px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span>
                  <b style={{ fontSize: 17 }}>{tk.name}</b>
                  {tk.description && (
                    <span style={{ color: 'var(--muted)', marginLeft: 10, fontSize: 13 }}>
                      {tk.description}
                    </span>
                  )}
                </span>
                <span className="badge badge-m">{tk.teip_count} тейпов</span>
              </button>

              {openTukhum === tk.id && (
                <div style={{ padding: '0 18px 16px' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))',
                      gap: 8,
                    }}
                  >
                    {(teipsCache[tk.id] ?? []).map((t) => (
                      <div key={t.id} className="ref-chip">
                        {t.name}
                      </div>
                    ))}
                    {teipsCache[tk.id]?.length === 0 && (
                      <span style={{ color: 'var(--muted)' }}>Тейпы не указаны</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {tab === 'villages' && (
        <section style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="input"
              placeholder="Поиск населённого пункта…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ maxWidth: 280 }}
            />
            <div className="toggle">
              <button className={extant === 'all' ? 'active' : ''} onClick={() => setExtant('all')}>
                Все
              </button>
              <button className={extant === 'extant' ? 'active' : ''} onClick={() => setExtant('extant')}>
                Действующие
              </button>
              <button className={extant === 'extinct' ? 'active' : ''} onClick={() => setExtant('extinct')}>
                Исторические
              </button>
            </div>
            <span style={{ color: 'var(--muted)', fontSize: 14 }}>показано: {totalShown}</span>
          </div>

          {villagesByDistrict.map(([district, list]) => (
            <div key={district} className="card">
              <h3 style={{ margin: '0 0 10px' }}>{district}</h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))',
                  gap: 8,
                }}
              >
                {list.map((v) => (
                  <div
                    key={v.id}
                    className={v.is_extant ? 'ref-chip' : 'ref-chip extinct'}
                    title={v.note ?? ''}
                  >
                    {v.name}
                    {v.type && <span className="meta"> · {v.type}</span>}
                    {!v.is_extant && <span className="dead"> · нежилое</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
