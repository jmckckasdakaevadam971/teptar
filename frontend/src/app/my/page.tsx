'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PublishControl } from '@/components/PublishControl/PublishControl';
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

  if (!ready || loading) return <div className="card">Загрузка…</div>;

  if (!user) {
    return (
      <div className="card" style={{ textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
        <h1>Моё древо</h1>
        <p style={{ color: 'var(--muted)' }}>
          Войдите, чтобы создавать и вести своё родословное древо.
        </p>
        <a className="btn-primary" href="/login?next=/my">
          Войти
        </a>
      </div>
    );
  }

  const isEmpty = !tree || tree.total === 0;
  const rootId = profile?.root_person_id ?? null;

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 820, margin: '0 auto' }}>
      <div>
        <h1>Моё древо</h1>
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>
          Здесь вы строите свою родословную и решаете, делиться ли ею с общей базой.
        </p>
      </div>

      {error && (
        <div className="card">
          <p className="vis-error" style={{ margin: 0 }}>{error}</p>
        </div>
      )}

      {isEmpty ? (
        /* Пустое состояние — крупный призыв начать */
        <div className="card mytree-empty">
          <div className="mytree-empty-ic">🌳</div>
          <h2 className="mytree-empty-title">У вас ещё нет древа</h2>
          <p className="mytree-empty-sub">
            Начните с себя или со старшего родственника — затем добавляйте родителей,
            детей и супругов прямо в древе одним кликом.
          </p>
          <a className="btn-primary mytree-cta" href="/persons/new">
            + Создать своё древо
          </a>
        </div>
      ) : (
        <>
          {/* Быстрые действия */}
          <div className="card mytree-actions">
            <div>
              <h2 className="mytree-h2">Продолжить построение</h2>
              <p style={{ color: 'var(--muted)', margin: 0 }}>
                Откройте древо и добавляйте родственников кнопками «сын / дочь / отец / жена».
              </p>
            </div>
            <div className="mytree-buttons">
              {rootId && (
                <a className="btn-primary" href={`/person/${rootId}`}>
                  Открыть моё древо
                </a>
              )}
              <a className="btn-secondary" href="/persons/new">
                + Новый корень
              </a>
            </div>
          </div>

          {/* Статистика */}
          <div className="card">
            <h2 className="mytree-h2">Сводка</h2>
            <div className="profile-stats">
              <div className="pstat">
                <span className="pstat-num">{tree!.total}</span>
                <span className="pstat-lbl">всего персон</span>
              </div>
              <div className="pstat">
                <span className="pstat-num">{tree!.published}</span>
                <span className="pstat-lbl">в общей базе</span>
              </div>
              <div className="pstat">
                <span className="pstat-num">{tree!.pending}</span>
                <span className="pstat-lbl">на модерации</span>
              </div>
              <div className="pstat">
                <span className="pstat-num">{tree!.private}</span>
                <span className="pstat-lbl">только у меня</span>
              </div>
            </div>
          </div>

          {/* Публикация / видимость */}
          <PublishControl />
        </>
      )}
    </div>
  );
}
