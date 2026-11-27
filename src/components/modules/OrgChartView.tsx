import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import {
  Download,
  FileImage,
  FileText,
  Mail,
  MapPin,
  Minus,
  Phone,
  Plus,
  RotateCcw,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { Position, User } from '../../types';
import { UserAvatar } from '../common/UserAvatar';

const CARD_WIDTH = 224;
const CARD_HEIGHT = 96;
const H_GAP = 32;
const V_GAP = 64;
const CANVAS_PAD_X = 64;
const BANNER_HEIGHT = 104;
const CANVAS_PAD_BOTTOM = 64;

interface TreeNode {
  user: User;
  position: Position | undefined;
  children: TreeNode[];
  subtreeWidth: number;
  x: number;
  y: number;
}

interface PositionedEdge {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  kind: 'manager' | 'mentor';
  mentorName?: string;
}

function buildOrgLayout(users: User[], positions: Position[]) {
  const activeUsers = users.filter((u) => u.isActive);
  if (activeUsers.length === 0) {
    return {
      nodes: [] as TreeNode[],
      edges: [] as PositionedEdge[],
      width: 0,
      height: 0,
      nodeMap: new Map<string, TreeNode>(),
    };
  }

  const activeMap = new Map<string, User>(activeUsers.map((u) => [u.id, u]));
  const posMap = new Map<string, Position>(positions.map((p) => [p.id, p]));

  // Cycle detection: trace managerId chains and break cycles deterministically
  const brokenCycleRoots = new Set<string>();
  const globalVisited = new Set<string>();

  for (const user of activeUsers) {
    if (globalVisited.has(user.id)) continue;
    const path: string[] = [];
    const pathSet = new Set<string>();
    let curr: User | undefined = user;
    while (curr && curr.managerId && activeMap.has(curr.managerId)) {
      if (pathSet.has(curr.id)) {
        const cycleStartIdx = path.indexOf(curr.id);
        const cycleIds = path.slice(cycleStartIdx);
        cycleIds.sort((aId, bId) => {
          const ua = activeMap.get(aId)!;
          const ub = activeMap.get(bId)!;
          const pa = posMap.get(ua.positionId)?.priorityLevel ?? 0;
          const pb = posMap.get(ub.positionId)?.priorityLevel ?? 0;
          if (pb !== pa) return pb - pa;
          const sd = ua.startDate.localeCompare(ub.startDate);
          if (sd !== 0) return sd;
          return ua.fullName.localeCompare(ub.fullName);
        });
        brokenCycleRoots.add(cycleIds[0]);
        break;
      }
      if (globalVisited.has(curr.id)) break;
      path.push(curr.id);
      pathSet.add(curr.id);
      curr = activeMap.get(curr.managerId);
    }
    for (const id of path) globalVisited.add(id);
  }

  const getEffectiveManagerId = (u: User): string | null => {
    if (brokenCycleRoots.has(u.id)) return null;
    if (u.managerId && activeMap.has(u.managerId) && u.managerId !== u.id) {
      return u.managerId;
    }
    return null;
  };

  const childrenMap = new Map<string | null, User[]>();
  for (const u of activeUsers) {
    const mgrId = getEffectiveManagerId(u);
    const list = childrenMap.get(mgrId) ?? [];
    list.push(u);
    childrenMap.set(mgrId, list);
  }

  const sortSiblings = (siblings: User[]): User[] => {
    const groups = new Map<string, { title: string; maxPriority: number; users: User[] }>();
    for (const u of siblings) {
      const pos = posMap.get(u.positionId);
      const title = pos?.title ?? 'Unassigned Position';
      const priority = pos?.priorityLevel ?? 0;
      const g = groups.get(title) ?? { title, maxPriority: priority, users: [] };
      g.maxPriority = Math.max(g.maxPriority, priority);
      g.users.push(u);
      groups.set(title, g);
    }

    const sortedUsersInGroup = (arr: User[]) =>
      [...arr].sort((a, b) => {
        const pa = posMap.get(a.positionId)?.priorityLevel ?? 0;
        const pb = posMap.get(b.positionId)?.priorityLevel ?? 0;
        if (pb !== pa) return pb - pa;
        const sd = a.startDate.localeCompare(b.startDate);
        if (sd !== 0) return sd;
        return a.fullName.localeCompare(b.fullName);
      });

    const sortedGroups = Array.from(groups.values())
      .map((g) => ({ ...g, users: sortedUsersInGroup(g.users) }))
      .sort((a, b) => {
        if (b.maxPriority !== a.maxPriority) return b.maxPriority - a.maxPriority;
        const earliestA = a.users[0]?.startDate ?? '';
        const earliestB = b.users[0]?.startDate ?? '';
        const sd = earliestA.localeCompare(earliestB);
        if (sd !== 0) return sd;
        return a.title.localeCompare(b.title);
      });

    return sortedGroups.flatMap((g) => g.users);
  };

  const buildNode = (u: User, depth: number, visitedInBranch: Set<string>): TreeNode => {
    visitedInBranch.add(u.id);
    const rawKids = (childrenMap.get(u.id) ?? []).filter((k) => !visitedInBranch.has(k.id));
    const orderedKids = sortSiblings(rawKids);
    const children = orderedKids.map((k) => buildNode(k, depth + 1, new Set(visitedInBranch)));

    const childrenWidth =
      children.length > 0
        ? children.reduce((sum, c) => sum + c.subtreeWidth, 0) + H_GAP * (children.length - 1)
        : 0;
    const subtreeWidth = Math.max(CARD_WIDTH, childrenWidth);

    return {
      user: u,
      position: posMap.get(u.positionId),
      children,
      subtreeWidth,
      x: 0,
      y: BANNER_HEIGHT + depth * (CARD_HEIGHT + V_GAP),
    };
  };

  const rootUsers = sortSiblings(childrenMap.get(null) ?? []);
  const rootNodes = rootUsers.map((r) => buildNode(r, 0, new Set()));

  const assignPositions = (node: TreeNode, startX: number) => {
    if (node.children.length === 0) {
      node.x = startX + (node.subtreeWidth - CARD_WIDTH) / 2;
      return;
    }
    const totalKidsWidth =
      node.children.reduce((sum, c) => sum + c.subtreeWidth, 0) + H_GAP * (node.children.length - 1);
    let cursorX = startX + (node.subtreeWidth - totalKidsWidth) / 2;
    for (const child of node.children) {
      assignPositions(child, cursorX);
      cursorX += child.subtreeWidth + H_GAP;
    }
    const firstChildCenter = node.children[0].x + CARD_WIDTH / 2;
    const lastChildCenter = node.children[node.children.length - 1].x + CARD_WIDTH / 2;
    node.x = (firstChildCenter + lastChildCenter) / 2 - CARD_WIDTH / 2;
  };

  const totalRootsWidth =
    rootNodes.reduce((sum, r) => sum + r.subtreeWidth, 0) + H_GAP * Math.max(0, rootNodes.length - 1);

  let rootCursor = CANVAS_PAD_X;
  for (const r of rootNodes) {
    assignPositions(r, rootCursor);
    rootCursor += r.subtreeWidth + H_GAP;
  }

  const flatNodes: TreeNode[] = [];
  const nodeMap = new Map<string, TreeNode>();
  let maxBottom = BANNER_HEIGHT + CARD_HEIGHT;

  const collect = (node: TreeNode) => {
    flatNodes.push(node);
    nodeMap.set(node.user.id, node);
    maxBottom = Math.max(maxBottom, node.y + CARD_HEIGHT);
    for (const c of node.children) collect(c);
  };
  for (const r of rootNodes) collect(r);

  const edges: PositionedEdge[] = [];
  for (const node of flatNodes) {
    for (const child of node.children) {
      edges.push({
        id: `mgr-${node.user.id}-${child.user.id}`,
        fromX: node.x + CARD_WIDTH / 2,
        fromY: node.y + CARD_HEIGHT,
        toX: child.x + CARD_WIDTH / 2,
        toY: child.y,
        kind: 'manager',
      });
    }
  }

  for (const node of flatNodes) {
    const mentorId = node.user.mentorId;
    if (mentorId && nodeMap.has(mentorId) && mentorId !== node.user.id) {
      const mentorNode = nodeMap.get(mentorId)!;
      edges.push({
        id: `mnt-${mentorNode.user.id}-${node.user.id}`,
        fromX: mentorNode.x + CARD_WIDTH / 2,
        fromY: mentorNode.y + CARD_HEIGHT,
        toX: node.x + CARD_WIDTH / 2,
        toY: node.y,
        kind: 'mentor',
        mentorName: mentorNode.user.fullName,
      });
    }
  }

  return {
    nodes: flatNodes,
    edges,
    width: Math.max(820, totalRootsWidth + CANVAS_PAD_X * 2),
    height: maxBottom + CANVAS_PAD_BOTTOM,
    nodeMap,
  };
}

function buildOrthogonalPath(edge: PositionedEdge, indexOffset: number): string {
  if (edge.kind === 'manager') {
    const midY = edge.fromY + (edge.toY - edge.fromY) / 2;
    return `M ${edge.fromX} ${edge.fromY} L ${edge.fromX} ${midY} L ${edge.toX} ${midY} L ${edge.toX} ${edge.toY}`;
  }
  const sameRow = Math.abs(edge.fromY - edge.toY) < CARD_HEIGHT + 10;
  if (sameRow) {
    const dipY = Math.max(edge.fromY, edge.toY) + 24 + (indexOffset % 3) * 10;
    const targetBottomY = edge.toY + CARD_HEIGHT;
    return `M ${edge.fromX} ${edge.fromY} L ${edge.fromX} ${dipY} L ${edge.toX} ${dipY} L ${edge.toX} ${targetBottomY}`;
  }
  const midY = edge.fromY + (edge.toY - edge.fromY) * 0.35 + (indexOffset % 3) * 8;
  return `M ${edge.fromX} ${edge.fromY} L ${edge.fromX} ${midY} L ${edge.toX} ${midY} L ${edge.toX} ${edge.toY}`;
}

export const OrgChartView: React.FC = () => {
  const { state, notify } = useAppStore();
  const viewportRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  const layout = useMemo(
    () => buildOrgLayout(state.users, state.positions),
    [state.users, state.positions]
  );

  const [zoom, setZoom] = useState<number>(0.9);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);
  const hasCenteredRef = useRef(false);

  const computeCenteredState = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp || layout.width === 0 || layout.height === 0) {
      return { z: 1, x: 0, y: 0 };
    }
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const fitScale = Math.min((vw - 48) / layout.width, (vh - 48) / layout.height, 1);
    const clampedZoom = Math.max(0.1, Math.min(2.0, Number(fitScale.toFixed(2))));
    const centeredX = (vw - layout.width * clampedZoom) / 2;
    const centeredY = Math.max(16, (vh - layout.height * clampedZoom) / 2);
    return { z: clampedZoom, x: centeredX, y: centeredY };
  }, [layout.width, layout.height]);

  const resetView = useCallback(() => {
    const { z, x, y } = computeCenteredState();
    setZoom(z);
    setPan({ x, y });
  }, [computeCenteredState]);

  useEffect(() => {
    if (!hasCenteredRef.current && layout.nodes.length > 0) {
      hasCenteredRef.current = true;
      resetView();
    }
  }, [layout.nodes.length, resetView]);

  const applyCenterAnchoredZoom = useCallback((nextZoomRaw: number) => {
    const nextZoom = Math.max(0.1, Math.min(2.0, Number(nextZoomRaw.toFixed(2))));
    const vp = viewportRef.current;
    if (!vp) {
      setZoom(nextZoom);
      return;
    }
    const cx = vp.clientWidth / 2;
    const cy = vp.clientHeight / 2;
    setZoom((prevZoom) => {
      if (prevZoom === nextZoom) return prevZoom;
      const ratio = nextZoom / prevZoom;
      setPan((prevPan) => ({
        x: cx - (cx - prevPan.x) * ratio,
        y: cy - (cy - prevPan.y) * ratio,
      }));
      return nextZoom;
    });
  }, []);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    applyCenterAnchoredZoom(zoom + delta);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button[data-org-card="true"]')) return;
    setIsPanning(true);
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      panX: pan.x,
      panY: pan.y,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPanning || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.clientX;
    const dy = e.clientY - dragStartRef.current.clientY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragStartRef.current.moved = true;
    }
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy,
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isPanning) return;
    setIsPanning(false);
    dragStartRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer wasn't captured
    }
  };

  // High-resolution 2x full-bounds export on forced #FFFFFF light theme
  const captureChartAsJpegDataUrl = async (): Promise<string | null> => {
    if (!exportRef.current) return null;
    return toJpeg(exportRef.current, {
      quality: 0.96,
      pixelRatio: 2,
      backgroundColor: '#FFFFFF',
      width: layout.width,
      height: layout.height,
    });
  };

  const handleExportJpeg = async () => {
    if (layout.nodes.length === 0) return;
    setExporting(true);
    try {
      const dataUrl = await captureChartAsJpegDataUrl();
      if (!dataUrl) return;
      const link = document.createElement('a');
      link.download = 'department-structure-org-chart.jpg';
      link.href = dataUrl;
      link.click();
      notify('Exported high-resolution Org Chart JPEG');
    } catch {
      notify('Failed to export JPEG', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    if (layout.nodes.length === 0) return;
    setExporting(true);
    try {
      const dataUrl = await captureChartAsJpegDataUrl();
      if (!dataUrl) return;
      const orientation = layout.width >= layout.height ? 'landscape' : 'portrait';
      const pdf = new jsPDF({
        orientation,
        unit: 'mm',
        format: 'a4',
      });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const availW = pageW - margin * 2;
      const availH = pageH - margin * 2;
      const scale = Math.min(availW / layout.width, availH / layout.height);
      const drawW = layout.width * scale;
      const drawH = layout.height * scale;
      const offsetX = (pageW - drawW) / 2;
      const offsetY = (pageH - drawH) / 2;

      pdf.addImage(dataUrl, 'JPEG', offsetX, offsetY, drawW, drawH, undefined, 'FAST');
      pdf.save('department-structure-org-chart.pdf');
      notify(`Exported A4 ${orientation} PDF`);
    } catch {
      notify('Failed to export PDF', 'error');
    } finally {
      setExporting(false);
    }
  };

  const selectedUser = useMemo(
    () => (selectedUserId ? state.users.find((u) => u.id === selectedUserId) : undefined),
    [state.users, selectedUserId]
  );

  if (layout.nodes.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-12 text-center">
        <Users className="h-10 w-10 text-neutral-300 dark:text-neutral-700 mx-auto mb-3" />
        <h2 className="text-base font-display font-semibold text-neutral-900 dark:text-neutral-100">
          No staff profiles found
        </h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Add active staff profiles in the Staff Directory to generate the Department Structure automatically.
        </p>
      </div>
    );
  }

  const renderTreeScene = (forcedLight: boolean) => {
    const mentorEdges = layout.edges.filter((e) => e.kind === 'mentor');
    const managerEdges = layout.edges.filter((e) => e.kind === 'manager');

    return (
      <div
        style={{ width: layout.width, height: layout.height }}
        className={`relative select-none ${
          forcedLight ? 'bg-white text-neutral-900' : 'bg-transparent text-neutral-900 dark:text-neutral-100'
        }`}
      >
        {/* Canvas Title Banner + Legend */}
        <div
          className={`absolute top-4 left-8 right-8 h-16 px-6 rounded-xl border flex items-center justify-between gap-6 ${
            forcedLight
              ? 'bg-neutral-50 border-neutral-200 text-neutral-900'
              : 'bg-white/95 dark:bg-[#0A0A0C]/95 border-neutral-200 dark:border-zinc-800'
          }`}
        >
          <div>
            <h2 className="text-base font-display font-bold tracking-tight">
              Department Structure
            </h2>
            <p className={`text-xs ${forcedLight ? 'text-neutral-500' : 'text-neutral-500 dark:text-neutral-400'}`}>
              {state.branding.appName} · {layout.nodes.length} Active Staff · Live Hierarchy
            </p>
          </div>

          <div className="flex items-center gap-5 text-xs shrink-0">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block w-6 h-0.5 ${
                  forcedLight ? 'bg-neutral-600' : 'bg-neutral-500 dark:bg-zinc-500'
                }`}
              />
              <span className={forcedLight ? 'text-neutral-700' : 'text-neutral-600 dark:text-neutral-300'}>
                Direct Reports
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-6 border-t-2 border-dashed border-sky-600 dark:border-sky-400" />
              <span className={forcedLight ? 'text-neutral-700' : 'text-neutral-600 dark:text-neutral-300'}>
                Mentorship Pair
              </span>
            </div>
          </div>
        </div>

        {/* SVG Orthogonal Connectors */}
        <svg
          width={layout.width}
          height={layout.height}
          className="absolute inset-0 pointer-events-none"
        >
          {managerEdges.map((edge, idx) => (
            <path
              key={edge.id}
              d={buildOrthogonalPath(edge, idx)}
              fill="none"
              stroke={forcedLight ? '#525252' : '#71717A'}
              strokeWidth={1.75}
              strokeLinejoin="round"
            />
          ))}
          {mentorEdges.map((edge, idx) => (
            <path
              key={edge.id}
              d={buildOrthogonalPath(edge, idx)}
              fill="none"
              stroke="#0284C7"
              strokeWidth={1.75}
              strokeDasharray="6 4"
              strokeLinejoin="round"
            />
          ))}
        </svg>

        {/* Person Cards */}
        {layout.nodes.map((node) => {
          const mentorUser = node.user.mentorId
            ? state.users.find((u) => u.id === node.user.mentorId && u.isActive)
            : undefined;
          const isMentoringSomeone = mentorEdges.some((e) => e.mentorName === node.user.fullName);
          const roleTitle =
            node.position?.title ??
            (node.user.roleIds.includes('role-admin') ? 'Administrator' : 'Staff Member');

          return (
            <button
              key={node.user.id}
              type="button"
              data-org-card="true"
              onClick={() => setSelectedUserId(node.user.id)}
              style={{
                left: node.x,
                top: node.y,
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
              }}
              className={`absolute text-left rounded-xl border p-3.5 transition-all flex items-center gap-3 ${
                forcedLight
                  ? 'bg-white border-neutral-300 text-neutral-900 shadow-sm'
                  : 'bg-white dark:bg-[#0A0A0C] border-neutral-200 dark:border-zinc-800 hover:border-sky-500 dark:hover:border-sky-500 shadow-sm hover:shadow-md cursor-pointer'
              }`}
            >
              <UserAvatar name={node.user.fullName} avatarUrl={node.user.avatarUrl} size="md" />
              <div className="min-w-0 flex-1">
                <div
                  className={`text-sm font-display font-semibold truncate ${
                    forcedLight ? 'text-neutral-900' : 'text-neutral-900 dark:text-neutral-100'
                  }`}
                >
                  {node.user.fullName}
                </div>
                <div
                  className={`text-xs truncate mt-0.5 ${
                    forcedLight ? 'text-neutral-600' : 'text-neutral-500 dark:text-neutral-400'
                  }`}
                >
                  {roleTitle}
                </div>
                {(mentorUser || isMentoringSomeone) && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {mentorUser && (
                      <span className="inline-flex items-center rounded border border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-400">
                        Mentee
                      </span>
                    )}
                    {isMentoringSomeone && (
                      <span className="inline-flex items-center rounded border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                        Mentor
                      </span>
                    )}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Toolbar Controls */}
      <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => applyCenterAnchoredZoom(zoom - 0.1)}
            disabled={zoom <= 0.1}
            className="p-1.5 rounded-lg border border-neutral-200 dark:border-zinc-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-zinc-900 disabled:opacity-40"
            aria-label="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </button>

          <input
            type="range"
            min={10}
            max={200}
            step={5}
            value={Math.round(zoom * 100)}
            onChange={(e) => applyCenterAnchoredZoom(Number(e.target.value) / 100)}
            className="w-24 sm:w-32 accent-sky-600"
            aria-label="Zoom percentage slider"
          />

          <span className="w-12 text-center font-mono-tabular text-xs font-semibold text-neutral-700 dark:text-neutral-200">
            {Math.round(zoom * 100)}%
          </span>

          <button
            type="button"
            onClick={() => applyCenterAnchoredZoom(zoom + 0.1)}
            disabled={zoom >= 2.0}
            className="p-1.5 rounded-lg border border-neutral-200 dark:border-zinc-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-zinc-900 disabled:opacity-40"
            aria-label="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={resetView}
            className="ml-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-zinc-900 whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset View
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={exporting}
            onClick={handleExportJpeg}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-zinc-900 disabled:opacity-50 whitespace-nowrap"
          >
            <FileImage className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
            <span>{exporting ? 'Exporting...' : 'Export JPEG'}</span>
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={handleExportPdf}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{exporting ? 'Exporting...' : 'Export PDF'}</span>
          </button>
        </div>
      </div>

      {/* Interactive Pan/Zoom Canvas */}
      <div
        ref={viewportRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`relative w-full h-[640px] rounded-xl border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black overflow-hidden touch-none ${
          isPanning ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(161, 161, 170, 0.2) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
          className="absolute top-0 left-0"
        >
          {renderTreeScene(false)}
        </div>
      </div>

      {/* Hidden Unclipped Forced-Light Export Stage (2x Resolution Capture) */}
      <div aria-hidden="true" className="fixed -left-[99999px] top-0 pointer-events-none">
        <div ref={exportRef} style={{ width: layout.width, height: layout.height }}>
          {renderTreeScene(true)}
        </div>
      </div>

      {/* Read-Only Profile Quick-View Drawer */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="fixed inset-0 bg-black/60" onClick={() => setSelectedUserId(null)} />
          <div className="relative z-10 w-full max-w-md bg-white dark:bg-[#0A0A0C] border-l border-neutral-200 dark:border-zinc-800 h-full flex flex-col shadow-2xl">
            <div className="px-6 py-4 border-b border-neutral-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-display font-semibold text-neutral-900 dark:text-neutral-100">
                <FileText className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                <span>Staff Quick-View</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUserId(null)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                aria-label="Close quick-view"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="flex items-center gap-4">
                <UserAvatar name={selectedUser.fullName} avatarUrl={selectedUser.avatarUrl} size="xl" />
                <div>
                  <h3 className="text-lg font-display font-bold text-neutral-900 dark:text-neutral-100">
                    {selectedUser.fullName}
                  </h3>
                  <p className="text-sm font-medium text-sky-600 dark:text-sky-400">
                    {state.positions.find((p) => p.id === selectedUser.positionId)?.title ??
                      (selectedUser.roleIds.includes('role-admin') ? 'Administrator' : 'Staff Member')}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {selectedUser.department} · Started{' '}
                    <span className="font-mono-tabular">{selectedUser.startDate}</span>
                  </p>
                </div>
              </div>

              {selectedUser.bio && (
                <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
                  {selectedUser.bio}
                </p>
              )}

              <div className="space-y-3 pt-3 border-t border-neutral-100 dark:border-zinc-800 text-sm">
                <div className="flex items-center gap-3 text-neutral-600 dark:text-neutral-300">
                  <Mail className="h-4 w-4 text-neutral-400 shrink-0" />
                  <span className="truncate">{selectedUser.email}</span>
                </div>
                <div className="flex items-center gap-3 text-neutral-600 dark:text-neutral-300">
                  <Phone className="h-4 w-4 text-neutral-400 shrink-0" />
                  <span className="font-mono-tabular">{selectedUser.phone || 'Not provided'}</span>
                </div>
                <div className="flex items-center gap-3 text-neutral-600 dark:text-neutral-300">
                  <MapPin className="h-4 w-4 text-neutral-400 shrink-0" />
                  <span>{selectedUser.location || 'HQ'}</span>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-neutral-100 dark:border-zinc-800 text-xs">
                <div>
                  <span className="text-neutral-500 dark:text-neutral-400">Direct Manager:</span>
                  <div className="mt-1 font-medium text-neutral-900 dark:text-neutral-100">
                    {selectedUser.managerId
                      ? state.users.find((u) => u.id === selectedUser.managerId)?.fullName ?? 'None'
                      : 'Top-Level Root'}
                  </div>
                </div>

                <div>
                  <span className="text-neutral-500 dark:text-neutral-400">Assigned Mentor:</span>
                  <div className="mt-1 font-medium text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                    <UserCheck className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
                    <span>
                      {selectedUser.mentorId
                        ? state.users.find((u) => u.id === selectedUser.mentorId)?.fullName ?? 'None'
                        : 'None assigned'}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-neutral-500 dark:text-neutral-400">Direct Reports:</span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {state.users
                      .filter((u) => u.isActive && u.managerId === selectedUser.id)
                      .map((rep) => (
                        <button
                          key={rep.id}
                          type="button"
                          onClick={() => setSelectedUserId(rep.id)}
                          className="px-2.5 py-1 rounded-md border border-neutral-200 dark:border-zinc-800 hover:border-sky-500 text-neutral-700 dark:text-neutral-200"
                        >
                          {rep.fullName}
                        </button>
                      ))}
                    {state.users.filter((u) => u.isActive && u.managerId === selectedUser.id).length === 0 && (
                      <span className="text-neutral-400">No direct reports</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-100 dark:border-zinc-800 text-[11px] text-neutral-400">
                Org Chart quick-view is read-only. Manage reporting lines in Staff Directory.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
