/**
 * Переиспользуемые наборы Tailwind-классов для общих UI-элементов.
 * Единый источник, чтобы не дублировать строки по компонентам.
 */

// Ссылка в шапке
export const NAV_LINK =
  "text-sm font-medium text-muted-foreground transition-colors hover:text-foreground";

// Кнопка-ссылка (текстовая, золотая)
export const LINK_BTN =
  "cursor-pointer border-0 bg-transparent p-0 text-left text-sm font-medium text-primary transition-colors hover:text-accent hover:underline";

// Основная кнопка
export const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-all hover:-translate-y-0.5 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:translate-y-0";

// Вторичная (контурная) кнопка
export const BTN_SECONDARY =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-border px-5 py-3 font-sans text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary";

// Неактивная кнопка-заглушка
export const BTN_DISABLED =
  "inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-5 py-3 font-sans text-sm font-semibold text-muted-foreground";

// Карточка с золотым акцентом (рамка + лёгкая заливка)
export const ACCENT_CARD = "rounded-2xl border border-primary/40 bg-card p-6";

// Поле ввода
export const INPUT =
  "w-full min-w-0 rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary";

// Базовая карточка
export const CARD = "rounded-2xl border border-border bg-card p-6";

// Подпись поля
export const LABEL =
  "text-xs font-medium uppercase tracking-wide text-muted-foreground";

// Поле формы (label + control)
export const FIELD = "grid gap-1.5";

// Сетка формы
export const FORM_GRID = "grid gap-4";

// Ряд полей формы
export const FORM_ROW =
  "grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] items-start gap-3.5";

// Бейдж пола
const BADGE = "rounded-full px-2.5 py-0.5 text-xs font-medium";
export const BADGE_M = `${BADGE} bg-[#16304d] text-[#9ec5ff]`;
export const BADGE_F = `${BADGE} bg-[#3f1730] text-[#ff9ed4]`;

// Бейдж статуса видимости
const VIS_BADGE =
  "inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium";
export const VIS_PENDING = `${VIS_BADGE} bg-primary/15 text-primary`;
export const VIS_PUBLIC = `${VIS_BADGE} bg-[#14321f] text-[#7ee0a6]`;
export const VIS_REJECTED = `${VIS_BADGE} bg-[#341818] text-[#f0a0a0]`;
export const VIS_PRIVATE = `${VIS_BADGE} bg-secondary text-muted-foreground`;

// Сегментированные вкладки
export const TABS =
  "mb-5 inline-flex gap-1 rounded-xl border border-border bg-card p-1";
export function tabBtn(active: boolean) {
  return `cursor-pointer rounded-lg border-0 px-5 py-2 text-sm font-medium transition-colors ${
    active
      ? "bg-primary text-primary-foreground"
      : "bg-transparent text-muted-foreground hover:text-foreground"
  }`;
}

// Компактный переключатель (фильтры)
export const TOGGLE =
  "inline-flex gap-1 rounded-xl border border-border bg-card p-1";
export function toggleBtn(active: boolean) {
  return `cursor-pointer rounded-lg border-0 px-4 py-1.5 text-sm font-medium transition-colors ${
    active
      ? "bg-primary text-primary-foreground"
      : "bg-transparent text-muted-foreground hover:text-foreground"
  }`;
}

// Чип справочника (тейп/село)
export const CHIP =
  "rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground";
export const CHIP_EXTINCT =
  "rounded-lg border border-[#5b2c25] bg-[#2a1714] px-3 py-2 text-sm text-[#e6c9c2]";

// Текст ошибки / успеха под формой
export const ERR_TEXT = "mt-3 text-sm text-[#f0a0a0]";
export const OK_TEXT = "mt-3 text-sm text-[#7ee0a6]";

// Таблица данных (admin / модерация)
export const TABLE_WRAP = "overflow-x-auto rounded-2xl border border-border";
export const TABLE =
  "w-full border-collapse text-sm [&_th]:border-b [&_th]:border-border [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_td]:text-foreground [&_tbody_tr:last-child_td]:border-b-0 [&_tbody_tr:hover]:bg-primary/[0.06]";

// Текстовая кнопка-ссылка (опасное действие)
export const LINK_DANGER =
  "cursor-pointer border-0 bg-transparent p-0 text-sm font-medium text-[#f0a0a0] transition hover:underline disabled:opacity-50";

// Выпадающий список роли
export const ROLE_SELECT =
  "cursor-pointer rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-60";
