// Демонстрационные данные родового древа (без бэкенда).
// ⚠️ ВРЕМЕННО: используются на странице «Моё древо» для предпросмотра вёрстки,
// пока не подключены вход и API. Источник дизайна — v0-макет проекта.

export type Person = {
  id: string;
  name: string;
  birth?: string;
  death?: string;
  role: string;
  teip: string;
  gar?: string;
  village?: string;
  bio?: string;
  generation: number;
  parentId?: string;
  spouseName?: string;
};

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
