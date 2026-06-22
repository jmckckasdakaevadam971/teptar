'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { TreeStatus } from '@/lib/types';

const CUTOFF = 1970;

/**
 * Управление видимостью своего древа.
 * Личное (private) ⇄ общая база (public, через модерацию).
 * При публикации пользователь выбирает: показывать всех
 * или скрыть родившихся с 1970 года.
 */
export function PublishControl() {
  const [status, setStatus] = useState<TreeStatus | null>(null);
  const [mode, setMode] = useState<'all' | 'hide_recent'>('hide_recent');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await api.persons.treeStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить статус древа');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function publish() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api.persons.publish(mode, CUTOFF);
      setNotice(
        mode === 'hide_recent'
          ? `Отправлено на модерацию: ${r.published}. Скрыто (с ${CUTOFF} г.): ${r.hidden}.`
          : `Отправлено на модерацию: ${r.published}.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось опубликовать');
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.persons.unpublish();
      setNotice('Древо снова видно только вам.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось скрыть');
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return error ? (
      <div className="card vis-card">
        <p style={{ color: '#b91c1c', margin: 0 }}>{error}</p>
      </div>
    ) : null;
  }

  if (status.total === 0) return null;

  const inBase =
    status.state === 'pending' || status.state === 'published' || status.state === 'mixed';

  let badge: { cls: string; text: string };
  if (status.state === 'pending') {
    badge = { cls: 'vis-badge pending', text: '⏳ На модерации' };
  } else if (status.state === 'published') {
    badge = { cls: 'vis-badge public', text: '🌍 В общей базе' };
  } else if (status.state === 'mixed') {
    badge = { cls: 'vis-badge public', text: '🌍 Частично в общей базе' };
  } else if (status.rejected > 0) {
    badge = { cls: 'vis-badge rejected', text: '✖ Отклонено модератором' };
  } else {
    badge = { cls: 'vis-badge private', text: '🔒 Только у меня' };
  }

  return (
    <div className="card vis-card">
      <div className="vis-head">
        <div>
          <h3 className="vis-title">Видимость древа</h3>
          <p className="vis-sub">
            {inBase
              ? 'Ваше древо доступно в общей базе — другие могут найти общих предков.'
              : 'Сейчас древо личное. Опубликуйте его, чтобы поделиться с другими.'}
          </p>
        </div>
        <span className={badge.cls}>{badge.text}</span>
      </div>

      {error && <p className="vis-error">{error}</p>}
      {notice && <p className="vis-notice">{notice}</p>}

      {inBase ? (
        <div className="vis-actions">
          <button type="button" className="btn-secondary" onClick={() => void unpublish()} disabled={busy}>
            {busy ? 'Скрываю…' : '🔒 Убрать из общей базы'}
          </button>
        </div>
      ) : (
        <>
          <fieldset className="vis-modes" disabled={busy}>
            <label className={`vis-mode ${mode === 'hide_recent' ? 'sel' : ''}`}>
              <input
                type="radio"
                name="vis-mode"
                checked={mode === 'hide_recent'}
                onChange={() => setMode('hide_recent')}
              />
              <span>
                <b>Скрыть живущих</b>
                <small>В базе видны только предки до {CUTOFF} г. Родившиеся позже остаются личными.</small>
              </span>
            </label>
            <label className={`vis-mode ${mode === 'all' ? 'sel' : ''}`}>
              <input
                type="radio"
                name="vis-mode"
                checked={mode === 'all'}
                onChange={() => setMode('all')}
              />
              <span>
                <b>Показывать всех</b>
                <small>В общей базе будет всё древо, включая ныне живущих.</small>
              </span>
            </label>
          </fieldset>
          <div className="vis-actions">
            <button type="button" className="btn-primary" onClick={() => void publish()} disabled={busy}>
              {busy ? 'Отправляю…' : '🌍 Отправить в общую базу'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
