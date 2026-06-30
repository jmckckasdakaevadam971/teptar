"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2 } from "lucide-react";
import type { Person } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

// размеры узла и отступы для древовидной раскладки
const NODE_W = 176; // w-44
const NODE_H = 108;
const H_GAP = 24;
const V_GAP = 72;
const SLOT = NODE_W + H_GAP;
const ROW_PITCH = NODE_H + V_GAP;

// Уголковый коннектор: вертикаль от родителя к шине, горизонтальная шина
// и вертикали к каждому ребёнку.
type Connector = {
  px: number; // центр родителя по X
  py: number; // низ родителя по Y
  busY: number; // высота горизонтальной шины
  minX: number;
  maxX: number;
  children: { x: number; topY: number }[];
};

export function TreeView({
  people,
  selectedId,
  onSelect,
}: {
  people: Person[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [connectors, setConnectors] = useState<Connector[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // древовидная раскладка: каждый родитель центрируется над своими детьми
  const layout = useMemo(() => {
    const idSet = new Set(people.map((p) => p.id));
    const childrenMap = new Map<string, Person[]>();
    const roots: Person[] = [];
    for (const p of people) {
      if (p.parentId && idSet.has(p.parentId)) {
        const arr = childrenMap.get(p.parentId) ?? [];
        arr.push(p);
        childrenMap.set(p.parentId, arr);
      } else {
        roots.push(p);
      }
    }

    const pos: Record<string, { x: number; y: number }> = {};
    if (!people.length) return { pos, width: NODE_W, height: NODE_H };

    const minGen = Math.min(...people.map((p) => p.generation));
    const maxGen = Math.max(...people.map((p) => p.generation));
    let cursor = 0;

    // дети раскладываются справа налево: первый добавленный — правее
    const place = (node: Person): number => {
      const kids = childrenMap.get(node.id);
      let x: number;
      if (!kids || kids.length === 0) {
        x = cursor * SLOT;
        cursor += 1;
      } else {
        const xs = [...kids].reverse().map(place);
        x = (Math.min(...xs) + Math.max(...xs)) / 2;
      }
      pos[node.id] = { x, y: (node.generation - minGen) * ROW_PITCH };
      return x;
    };
    [...roots].reverse().forEach(place);

    const width = cursor > 0 ? (cursor - 1) * SLOT + NODE_W : NODE_W;
    const height = (maxGen - minGen) * ROW_PITCH + NODE_H;
    return { pos, width, height };
  }, [people]);

  const selected = people.find((p) => p.id === selectedId) ?? null;

  // вычисляем уголковые связи родитель → дети.
  // Координаты X/Y берём из layout (надёжно), высоту карточки — из DOM.
  const computeConnectors = useCallback(() => {
    // группируем детей по родителю
    const byParent = new Map<string, Person[]>();
    for (const person of people) {
      if (!person.parentId) continue;
      const arr = byParent.get(person.parentId) ?? [];
      arr.push(person);
      byParent.set(person.parentId, arr);
    }

    const next: Connector[] = [];
    byParent.forEach((kids, parentId) => {
      const pPos = layout.pos[parentId];
      const parentEl = nodeRefs.current[parentId];
      if (!pPos || !parentEl) return;
      const px = pPos.x + NODE_W / 2;
      const py = pPos.y + parentEl.offsetHeight;

      const children: { x: number; topY: number }[] = [];
      for (const kid of kids) {
        const cPos = layout.pos[kid.id];
        if (!cPos) continue;
        children.push({ x: cPos.x + NODE_W / 2, topY: cPos.y });
      }
      if (!children.length) return;

      const childTopMin = Math.min(...children.map((c) => c.topY));
      const busY = py + (childTopMin - py) / 2;
      const xs = [px, ...children.map((c) => c.x)];
      next.push({
        px,
        py,
        busY,
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        children,
      });
    });
    setConnectors(next);
  }, [people, layout]);

  useEffect(() => {
    computeConnectors();
    const ro = new ResizeObserver(() => computeConnectors());
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", computeConnectors);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", computeConnectors);
    };
  }, [computeConnectors]);

  // зум колесом мыши, когда курсор над областью древа
  const [scale, setScale] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);
  // полноэкранный режим: больше места для просмотра большого древа
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // куда «привязать» точку под курсором после смены масштаба
  const pendingAnchor = useRef<{
    cx: number;
    cy: number;
    clientX: number;
    clientY: number;
  } | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const sizer = sizerRef.current;
      setScale((s) => {
        const next = Math.min(2, Math.max(0.4, s - e.deltaY * 0.0015));
        if (sizer && next !== s) {
          const rect = sizer.getBoundingClientRect();
          // точка под курсором в немасштабированных координатах
          pendingAnchor.current = {
            cx: (e.clientX - rect.left) / s,
            cy: (e.clientY - rect.top) / s,
            clientX: e.clientX,
            clientY: e.clientY,
          };
        }
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [isFullscreen]);

  // перемещение по древу перетаскиванием левой кнопкой мыши
  const [grabbing, setGrabbing] = useState(false);
  const draggedRef = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let down = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      down = true;
      draggedRef.current = false;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = el.scrollLeft;
      startTop = el.scrollTop;
    };
    const onMove = (e: MouseEvent) => {
      if (!down) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!draggedRef.current && Math.hypot(dx, dy) > 4) {
        draggedRef.current = true;
        setGrabbing(true);
      }
      if (draggedRef.current) {
        el.scrollLeft = startLeft - dx;
        el.scrollTop = startTop - dy;
      }
    };
    const onUp = () => {
      down = false;
      setGrabbing(false);
    };
    // если был drag — гасим клик, чтобы не выбрать узел случайно
    const onClick = (e: MouseEvent) => {
      if (draggedRef.current) {
        e.preventDefault();
        e.stopPropagation();
        draggedRef.current = false;
      }
    };

    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    el.addEventListener("click", onClick, true);
    return () => {
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      el.removeEventListener("click", onClick, true);
    };
  }, [isFullscreen]);

  // после смены масштаба смещаем скролл так, чтобы точка осталась под курсором
  useLayoutEffect(() => {
    const anchor = pendingAnchor.current;
    const el = scrollRef.current;
    if (!anchor || !el) return;
    pendingAnchor.current = null;
    const elRect = el.getBoundingClientRect();
    const contentW = layout.width * scale;
    const contentH = layout.height * scale;
    const centerX = Math.max(0, (el.clientWidth - contentW) / 2);
    const centerY = Math.max(0, (el.clientHeight - contentH) / 2);
    el.scrollLeft =
      centerX + anchor.cx * scale - (anchor.clientX - elRect.left);
    el.scrollTop = centerY + anchor.cy * scale - (anchor.clientY - elRect.top);
  }, [scale, layout.width, layout.height]);

  // подсветка предков выбранного узла
  const ancestorIds = new Set<string>();
  if (selected) {
    let cur: Person | undefined = selected;
    while (cur?.parentId) {
      ancestorIds.add(cur.parentId);
      cur = people.find((p) => p.id === cur?.parentId);
    }
  }

  // полноэкранный режим: больше места для просмотра большого древа
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  const fs = isFullscreen && mounted;

  const tree = (
    <div
      className={cn(
        fs
          ? "fixed inset-0 z-[55] flex flex-col bg-background p-4"
          : "relative",
      )}
    >
      <div className="absolute right-2 top-2 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setScale(1)}
          className="rounded-full border border-border bg-card/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          onClick={() => setIsFullscreen((v) => !v)}
          aria-label={isFullscreen ? "Свернуть" : "На весь экран"}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
        >
          {isFullscreen ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </button>
      </div>
      <div
        ref={scrollRef}
        className={cn(
          "overflow-auto pb-4",
          fs && "flex-1",
          grabbing ? "cursor-grabbing" : "cursor-grab",
        )}
        style={{ maxHeight: fs ? "100%" : "75vh" }}
      >
        <div
          ref={sizerRef}
          className="relative mx-auto"
          style={{ width: layout.width * scale, height: layout.height * scale }}
        >
          <div
            ref={containerRef}
            className="absolute left-0 top-0"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            {/* SVG связи */}
            <svg
              className="pointer-events-none absolute inset-0 z-0"
              width={layout.width}
              height={layout.height}
              aria-hidden="true"
            >
              {connectors.map((c, i) => (
                <g
                  key={i}
                  stroke="rgb(var(--primary) / 0.45)"
                  strokeWidth={2}
                  strokeLinecap="round"
                >
                  {/* спуск от родителя к шине */}
                  <line x1={c.px} y1={c.py} x2={c.px} y2={c.busY} />
                  {/* горизонтальная шина */}
                  <line x1={c.minX} y1={c.busY} x2={c.maxX} y2={c.busY} />
                  {/* спуски к каждому ребёнку */}
                  {c.children.map((ch, j) => (
                    <line
                      key={j}
                      x1={ch.x}
                      y1={c.busY}
                      x2={ch.x}
                      y2={ch.topY}
                    />
                  ))}
                </g>
              ))}
            </svg>

            {/* узлы древа (абсолютная раскладка) */}
            <div className="relative z-10">
              {people.map((person) => {
                const isSelected = person.id === selectedId;
                const isAncestor = ancestorIds.has(person.id);
                const isLiving = !person.death;
                const p = layout.pos[person.id];
                if (!p) return null;
                return (
                  <button
                    key={person.id}
                    ref={(el) => {
                      nodeRefs.current[person.id] = el;
                    }}
                    type="button"
                    onClick={() => onSelect(person.id)}
                    style={{
                      position: "absolute",
                      left: p.x,
                      top: p.y,
                      width: NODE_W,
                    }}
                    className={cn(
                      "group rounded-2xl border bg-card p-4 text-left transition-all duration-200 hover:-translate-y-0.5",
                      isSelected
                        ? "border-primary shadow-[0_0_0_1px_var(--primary)]"
                        : isAncestor
                          ? "border-primary/50"
                          : "border-border hover:border-primary/40",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-serif text-lg font-bold",
                          isSelected || isAncestor
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-primary",
                        )}
                      >
                        {person.name.charAt(0)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-serif text-base font-semibold text-foreground">
                          {person.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {person.birth}
                          {person.death ? `–${person.death}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {person.role}
                      </span>
                      {isLiving ? (
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                          жив
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return fs ? createPortal(tree, document.body) : tree;
}
