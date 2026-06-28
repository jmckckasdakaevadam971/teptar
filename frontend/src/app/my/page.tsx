'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PublishControl } from '@/components/PublishControl/PublishControl';
import { BTN_PRIMARY, BTN_SECONDARY, CARD } from '@/lib/ui';
import type { TreeStatus, UserProfile } from '@/lib/types';

/**
 * «Моё древо» — личная точка входа после регистрации.
 *  • пусто  → крупный призыв «Создать своё древо»;
 *  • есть   → кнопка «Открыть моё древо», статистика и публикация.
 */
export default function MyTreePage() {
  const { user, ready } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tree, setTree] = useState<TreeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, t] = await Promise.all([
        api.auth.profile(),
        api.persons.treeStatus().catch(() => null),
      ]);
      setProfile(p);
      setTree(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить древо');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready && user) void load();
    else if (ready) setLoading(false);
  }, [ready, user, load]);

  if (!ready || loading) return <div className={CARD}>Загрузка…</div>;

  if (!user) {
    return (
      <div className={`${CARD} mx-auto max-w-[480px] text-center`}>
        <h1 className="mb-2 text-3xl font-bold text-cream">Моё древо</h1>
        <p className="text-sand">
          Войдите, чтобы создавать и вести своё родословное древо.
        </p>
        <a className={`${BTN_PRIMARY} mt-3`} href="/login?next=/my">
          Войти
        </a>
      </div>
    );
  }

  const isEmpty = !tree || tree.total === 0;
  const rootId = profile?.root_person_id ?? null;

  return (
    <div className="mx-auto grid max-w-[820px] gap-5">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-cream">Моё древо</h1>
        <p className="mt-0 text-sand">
          Здесь вы строите свою родословную и решаете, делиться ли ею с общей базой.
        </p>
      </div>

      {error && (
        <div className={CARD}>
          <p className="m-0 text-sm text-[#dc2626]">{error}</p>
        </div>
      )}

      {isEmpty ? (
        /* Пустое состояние — крупный призыв начать */
        <div className={`${CARD} px-6 py-14 text-center`}>
          <div className="mb-3.5 text-[64px] leading-none">🌳</div>
          <h2 className="mb-2 text-[26px] font-bold text-cream">У вас ещё нет древа</h2>
          <p className="mx-auto mb-6 max-w-[460px] text-base leading-relaxed text-sand">
            Начните с себя или со старшего родственника — затем добавляйте родителей,
            детей и супругов прямо в древе одним кликом.
          </p>
          <a className={`${BTN_PRIMARY} !px-7 !py-3.5 !text-[17px]`} href="/persons/new">
            + Создать своё древо
          </a>
        </div>
      ) : (
        <>
          {/* Быстрые действия */}
          <div className={`${CARD} mb-3.5 flex flex-wrap items-center justify-between gap-4`}>
            <div>
              <h2 className="m-0 text-[22px] font-semibold text-cream">Продолжить построение</h2>
              <p className="m-0 text-sand">
                Откройте древо и добавляйте родственников кнопками «сын / дочь / отец / жена».
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {rootId && (
                <a className={BTN_PRIMARY} href={`/person/${rootId}`}>
                  Открыть моё древо
                </a>
              )}
              <a className={BTN_SECONDARY} href="/persons/new">
                + Новый корень
              </a>
            </div>
          </div>

          {/* Статистика */}
          <div className={CARD}>
            <h2 className="m-0 text-[22px] font-semibold text-cream">Сводка</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { num: tree!.total, lbl: 'всего персон' },
                { num: tree!.published, lbl: 'в общей базе' },
                { num: tree!.pending, lbl: 'на модерации' },
                { num: tree!.private, lbl: 'только у меня' },
              ].map((s) => (
                <div key={s.lbl} className="rounded-[10px] border border-line bg-stone-700 px-3 py-4 text-center">
                  <span className="block text-[28px] font-bold leading-none text-gold-light">{s.num}</span>
                  <span className="mt-1.5 block text-xs text-sand">{s.lbl}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Публикация / видимость */}
          <PublishControl />
        </>
      )}
    </div>
  );
}
