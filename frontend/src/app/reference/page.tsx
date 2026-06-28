'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { Teip, Tukhum, Village } from '@/lib/types';
import { BADGE_M, CARD, CHIP, CHIP_EXTINCT, INPUT, TABS, TOGGLE, tabBtn, toggleBtn } from '@/lib/ui';

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
    <div className="grid gap-5">
      <section>
        <h1 className="mb-2 text-3xl font-bold text-cream">Справочник Чеченской Республики</h1>
        <p className="mt-0 text-sand">
          Тукхумы, тейпы, гары и некъи; населённые пункты — действующие и
          исторические.
        </p>
        <div className={TABS}>
          <button className={tabBtn(tab === 'teips')} onClick={() => setTab('teips')}>
            Тукхумы и тейпы ({tukhums.reduce((n, t) => n + t.teip_count, 0)})
          </button>
          <button className={tabBtn(tab === 'villages')} onClick={() => setTab('villages')}>
            Населённые пункты ({villages.length})
          </button>
        </div>
      </section>

      {tab === 'teips' && (
        <section className="grid gap-2.5">
          {tukhums.map((tk) => (
            <div key={tk.id} className={`${CARD} !p-0`}>
              <button
                type="button"
                onClick={() => toggleTukhum(tk.id)}
                className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent px-[18px] py-3.5 text-left text-cream"
              >
                <span>
                  <b className="text-[17px] text-gold-light">{tk.name}</b>
                  {tk.description && (
                    <span className="ml-2.5 text-[13px] text-sand">{tk.description}</span>
                  )}
                </span>
                <span className={BADGE_M}>{tk.teip_count} тейпов</span>
              </button>

              {openTukhum === tk.id && (
                <div className="px-[18px] pb-4">
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
                    {(teipsCache[tk.id] ?? []).map((t) => (
                      <div key={t.id} className={CHIP}>
                        {t.name}
                      </div>
                    ))}
                    {teipsCache[tk.id]?.length === 0 && (
                      <span className="text-sand">Тейпы не указаны</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {tab === 'villages' && (
        <section className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className={`${INPUT} max-w-[280px]`}
              placeholder="Поиск населённого пункта…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className={TOGGLE}>
              <button className={toggleBtn(extant === 'all')} onClick={() => setExtant('all')}>
                Все
              </button>
              <button className={toggleBtn(extant === 'extant')} onClick={() => setExtant('extant')}>
                Действующие
              </button>
              <button className={toggleBtn(extant === 'extinct')} onClick={() => setExtant('extinct')}>
                Исторические
              </button>
            </div>
            <span className="text-sm text-sand">показано: {totalShown}</span>
          </div>

          {villagesByDistrict.map(([district, list]) => (
            <div key={district} className={CARD}>
              <h3 className="mb-2.5 mt-0 text-lg font-semibold text-cream">{district}</h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
                {list.map((v) => (
                  <div key={v.id} className={v.is_extant ? CHIP : CHIP_EXTINCT} title={v.note ?? ''}>
                    {v.name}
                    {v.type && <span className="text-xs text-sand"> · {v.type}</span>}
                    {!v.is_extant && <span className="text-xs text-[#e08a7a]"> · нежилое</span>}
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
