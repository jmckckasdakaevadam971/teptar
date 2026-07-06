// Демонстрационные данные родового древа (без бэкенда).
// ⚠️ ВРЕМЕННО: используются на странице «Моё древо» для предпросмотра вёрстки,
// пока не подключены вход и API. Источник дизайна — v0-макет проекта.

export type Person = {
  id: string;
  name: string;
  /** Фамилия (необязательно; в name хранится имя). */
  lastName?: string;
  /** Отчество (необязательно). */
  patronymic?: string;
  birth?: string;
  death?: string;
  /** Жив ли человек. Для старых записей без флага действует правило:
   *  жив, только если указан год рождения и нет года смерти. */
  alive?: boolean;
  role: string;
  teip: string;
  gar?: string;
  village?: string;
  bio?: string;
  generation: number;
  parentId?: string;
  /** Устаревшее поле одной супруги — читается для старых данных. */
  spouseName?: string;
  /** Список жён (может быть несколько). */
  spouseNames?: string[];
  gender?: "m" | "f";
  /** Цвет ветви, выбранный пользователем: наследуется потомками,
   *  пока потомок не переопределит своим цветом. */
  branchColor?: string;
  /** Ручное смещение карточки от авто-раскладки (перетаскивание мышкой). */
  offsetX?: number;
  offsetY?: number;
  /** Узел добавлен из второго древа при объединении родословных. */
  mergeAdded?: boolean;
  /** Имя хранителя, из чьей родословной добавлена ветвь. */
  mergeAuthor?: string;
  /** Точка соединения — общий человек, через которого слиты древа. */
  mergeAnchor?: boolean;
};

/** Все жёны человека: новое поле spouseNames + устаревшее spouseName. */
export function getSpouses(p: Person): string[] {
  const list = p.spouseNames ?? [];
  if (p.spouseName && !list.includes(p.spouseName)) {
    return [p.spouseName, ...list];
  }
  return list;
}

/** Женский узел: по полю gender или по роли «Дочь» (старые данные без gender). */
export function isFemale(p: Person): boolean {
  return p.gender === "f" || p.role.trim().toLowerCase() === "дочь";
}

/** Полное отображаемое имя: «Фамилия Имя Отчество» (пустые части опускаются). */
export function displayName(p: Person): string {
  return [p.lastName, p.name, p.patronymic]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ");
}

/** Жив ли человек. Явный флаг alive главнее; для старых записей без флага —
 *  жив, только если есть год рождения и нет года смерти (без дат — умер). */
export function isAlive(p: Person): boolean {
  if (typeof p.alive === "boolean") return p.alive;
  return Boolean(p.birth?.trim()) && !p.death?.trim();
}

// Родовое древо — узлы по поколениям (от предка к потомкам)
export const TREE: Person[] = [
  {
    id: "p1",
    name: "Тарам",
    birth: "1798",
    death: "1871",
    role: "Основатель ветви",
    teip: "Беной",
    gar: "Жоврбий",
    generation: 0,
    bio: "Родоначальник ветви, переселившийся в предгорья. Известен как мудрый старейшина.",
    spouseName: "Зайнап",
  },
  {
    id: "p2",
    name: "Идрис",
    birth: "1829",
    death: "1903",
    role: "Сын Тарама",
    teip: "Беной",
    gar: "Жоврбий",
    generation: 1,
    parentId: "p1",
    spouseName: "Хеда",
  },
  {
    id: "p3",
    name: "Висхан",
    birth: "1834",
    death: "1899",
    role: "Сын Тарама",
    teip: "Беной",
    gar: "Жоврбий",
    generation: 1,
    parentId: "p1",
    spouseName: "Малика",
  },
  {
    id: "p4",
    name: "Аюб",
    birth: "1861",
    death: "1934",
    role: "Сын Идриса",
    teip: "Беной",
    generation: 2,
    parentId: "p2",
    spouseName: "Тамара",
  },
  {
    id: "p5",
    name: "Саид",
    birth: "1866",
    death: "1940",
    role: "Сын Идриса",
    teip: "Беной",
    generation: 2,
    parentId: "p2",
    spouseName: "Бирлант",
  },
  {
    id: "p6",
    name: "Мовсар",
    birth: "1870",
    death: "1945",
    role: "Сын Висхана",
    teip: "Беной",
    generation: 2,
    parentId: "p3",
    spouseName: "Аза",
  },
  {
    id: "p7",
    name: "Ваха",
    birth: "1898",
    death: "1971",
    role: "Сын Аюба",
    teip: "Беной",
    generation: 3,
    parentId: "p4",
    spouseName: "Райхан",
  },
  {
    id: "p8",
    name: "Хасан",
    birth: "1902",
    death: "1978",
    role: "Сын Саида",
    teip: "Беной",
    generation: 3,
    parentId: "p5",
    spouseName: "Луиза",
  },
  {
    id: "p9",
    name: "Ислам",
    birth: "1931",
    role: "Сын Вахи",
    teip: "Беной",
    generation: 4,
    parentId: "p7",
    spouseName: "Седа",
  },
  {
    id: "p10",
    name: "Руслан",
    birth: "1968",
    role: "Сын Ислама",
    teip: "Беной",
    generation: 5,
    parentId: "p9",
    bio: "Хранитель семейного архива, ведёт родовую книгу.",
  },
];
