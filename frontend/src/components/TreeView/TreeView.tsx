'use client';

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { TreeNode } from '@/lib/types';

interface TreeViewProps {
  /** Узлы дерева (из /ancestors/:id/down или /up). */
  nodes: TreeNode[];
  /** Корневой id, от которого строится иерархия. */
  rootId: number;
  width?: number;
  height?: number;
  onSelect?: (id: number) => void;
}

/**
 * Анимированное генеалогическое древо на D3.
 * Строит иерархию из плоского списка узлов по связи father_id,
 * рисует её как дерево и анимирует появление узлов/связей.
 */
export function TreeView({
  nodes,
  rootId,
  width = 900,
  height = 600,
  onSelect,
}: TreeViewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    // 1. Превращаем плоский список в иерархию по отцу.
    const stratify = d3
      .stratify<TreeNode>()
      .id((d) => String(d.id))
      .parentId((d) => (d.id === rootId ? '' : d.father_id ? String(d.father_id) : ''));

    let root: d3.HierarchyNode<TreeNode>;
    try {
      root = stratify(nodes);
    } catch {
      // Если данные не образуют единое дерево — выходим тихо.
      return;
    }

    const layout = d3.tree<TreeNode>().size([width - 80, height - 120]);
    const tree = layout(root);

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg.append('g').attr('transform', 'translate(40,60)');

    // 2. Связи между узлами.
    g.selectAll('path.link')
      .data(tree.links())
      .join('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('stroke', '#6b5e3f')
      .attr('stroke-width', 1.5)
      .attr(
        'd',
        d3
          .linkVertical<d3.HierarchyPointLink<TreeNode>, d3.HierarchyPointNode<TreeNode>>()
          .x((d) => d.x)
          .y((d) => d.y),
      )
      .attr('stroke-dasharray', function () {
        const len = (this as SVGPathElement).getTotalLength();
        return `${len} ${len}`;
      })
      .attr('stroke-dashoffset', function () {
        return (this as SVGPathElement).getTotalLength();
      })
      .transition()
      .duration(800)
      .attr('stroke-dashoffset', 0);

    // 3. Узлы.
    const node = g
      .selectAll('g.node')
      .data(tree.descendants())
      .join('g')
      .attr('class', 'node')
      .attr('transform', (d) => `translate(${d.x},${d.y})`)
      .style('cursor', 'pointer')
      .on('click', (_e, d) => onSelect?.(d.data.id));

    node
      .append('circle')
      .attr('r', 0)
      .attr('fill', (d) => (d.data.gender === 'f' ? '#f9a8d4' : '#3b82f6'))
      .attr('stroke', '#f1e9d8')
      .attr('stroke-width', 1.5)
      .transition()
      .delay((_d, i) => i * 60)
      .duration(400)
      .attr('r', 18);

    node
      .append('text')
      .attr('dy', 34)
      .attr('text-anchor', 'middle')
      .attr('font-size', 12)
      .attr('fill', '#f1e9d8')
      .text((d) => d.data.full_name)
      .style('opacity', 0)
      .transition()
      .delay((_d, i) => i * 60)
      .duration(400)
      .style('opacity', 1);

    node
      .append('text')
      .attr('dy', 48)
      .attr('text-anchor', 'middle')
      .attr('font-size', 10)
      .attr('fill', '#b3a78d')
      .text((d) => {
        const b = d.data.birth_year ?? '';
        const dd = d.data.death_year ?? '';
        return b || dd ? `${b}–${dd}` : '';
      });
  }, [nodes, rootId, width, height, onSelect]);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      style={{ background: '#171310', border: '1px solid #3a3225', borderRadius: 12, width: '100%', height: 'auto' }}
    />
  );
}
