import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import {
  Download,
  FileImage,
  FileText,
  Mail,
  MapPin,
  Maximize2,
  Minus,
  Phone,
  Plus,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { Position, User } from '../../types';
import { compareUsersByRankAndJoinDate, sortUsersByRankAndJoinDate } from '../../utils/orgSort';
import { UserAvatar } from '../common/UserAvatar';

const PHOTO_SIZE = 116;
const NODE_WIDTH = 184;
const NODE_HEIGHT = 188;
const PHOTO_INSET_X = (NODE_WIDTH - PHOTO_SIZE) / 2; // 34px

const H_GAP = 40;
const V_GAP_TOP = 64;
const V_GAP_CHAIN = 30;
const STACK_INDENT = 36;
const RAIL_GAP = 36;

const CANVAS_PAD_X = 72;
const BANNER_HEIGHT = 128;
const CANVAS_PAD_BOTTOM = 72;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;

interface TreeNode {
  user: User;
  position: Position | undefined;
  children: TreeNode[];
  depth: number;
  relLeft: number;
  relRight: number;
  subtreeWidth: number;
  subtreeHeight: number;
  x: number;
  y: number;
}

type EdgeSpec =
  | {
      id: string;
      kind: 'orthogonal-down';
      fromX: number;
      fromY: number;
      midY: number;
      toX: number;
      toY: number;
    }
  | {
      id: string;
      kind: 'straight-down';
      x: number;
      fromY: number;
      toY: number;
    }
  | {
      id: string;
      kind: 'chain-spine';
      x: number;
      fromY: number;
      toY: number;
    }
  | {
      id: string;
      kind: 'chain-branch';
      fromX: number;
      toX: number;
      y: number;
    }
  | {
      id: string;
      kind: 'mentor';
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      mentorName: string;
    };

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function buildOrgLayout(users: User[], positions: Position[]) {
  const activeUsers = users.filter((u) => u.isActive);
  if (activeUsers.length === 0) {
    return {
      nodes: [] as TreeNode[],
      edges: [] as EdgeSpec[],
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
        cycleIds.sort((aId, bId) =>
          compareUsersByRankAndJoinDate(activeMap.get(aId)!, activeMap.get(bId)!, posMap)
        );
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

  const sortSiblings = (siblings: User[]): User[] =>
    [...siblings].sort((a, b) => compareUsersByRankAndJoinDate(a, b, posMap));

  // Build nodes & measure bounds bottom-up:
  // - Depth 0 (roots) fan out Depth 1 children horizontally left-to-right.
  // - Depth >= 1 nodes stack their direct reports vertically below them continuously.
  const buildNode = (u: User, depth: number, visitedInBranch: Set<string>): TreeNode => {
    visitedInBranch.add(u.id);
    const rawKids = (childrenMap.get(u.id) ?? []).filter((k) => !visitedInBranch.has(k.id));
    const orderedKids = sortSiblings(rawKids);
    const children = orderedKids.map((k) => buildNode(k, depth + 1, new Set(visitedInBranch)));

    if (depth === 0) {
      const childrenWidth =
        children.length > 0
          ? children.reduce((sum, c) => sum + c.subtreeWidth, 0) + H_GAP * (children.length - 1)
          : 0;
      const subtreeWidth = Math.max(NODE_WIDTH, childrenWidth);
      const maxChildHeight = children.reduce((m, c) => Math.max(m, c.subtreeHeight), 0);
      const subtreeHeight =
        children.length > 0 ? NODE_HEIGHT + V_GAP_TOP + maxChildHeight : NODE_HEIGHT;

      return {
        user: u,
        position: posMap.get(u.positionId),
        children,
        depth,
        relLeft: 0,
        relRight: subtreeWidth,
        subtreeWidth,
        subtreeHeight,
        x: 0,
        y: BANNER_HEIGHT,
      };
    }

    // Depth >= 1: vertical continuous sub-team stacking
    if (children.length === 0) {
      return {
        user: u,
        position: posMap.get(u.positionId),
        children,
        depth,
        relLeft: 0,
        relRight: NODE_WIDTH,
        subtreeWidth: NODE_WIDTH,
        subtreeHeight: NODE_HEIGHT,
        x: 0,
        y: 0,
      };
    }

    const useRail = children.length >= 2;
    const childIndent = useRail ? STACK_INDENT : 0;
    let relLeft = 0;
    let relRight = NODE_WIDTH;
    let totalHeight = NODE_HEIGHT;

    for (const child of children) {
      relLeft = Math.min(relLeft, childIndent + child.relLeft);
      relRight = Math.max(relRight, childIndent + child.relRight);
      totalHeight += V_GAP_CHAIN + child.subtreeHeight;
    }

    return {
      user: u,
      position: posMap.get(u.positionId),
      children,
      depth,
      relLeft,
      relRight,
      subtreeWidth: relRight - relLeft,
      subtreeHeight: totalHeight,
      x: 0,
      y: 0,
    };
  };

  const rootUsers = sortSiblings(childrenMap.get(null) ?? []);
  const rootNodes = rootUsers.map((r) => buildNode(r, 0, new Set()));

  const assignVerticalPositions = (node: TreeNode, nodeX: number, nodeY: number) => {
    node.x = nodeX;
    node.y = nodeY;
    if (node.children.length === 0) return;

    const useRail = node.children.length >= 2;
    const childX = nodeX + (useRail ? STACK_INDENT : 0);
    let cursorY = nodeY + NODE_HEIGHT + V_GAP_CHAIN;

    for (const child of node.children) {
      assignVerticalPositions(child, childX, cursorY);
      cursorY += child.subtreeHeight + V_GAP_CHAIN;
    }
  };

  const assignRootPositions = (root: TreeNode, startX: number) => {
    root.y = BANNER_HEIGHT;
    if (root.children.length === 0) {
      root.x = startX + (root.subtreeWidth - NODE_WIDTH) / 2;
      return;
    }

    const totalKidsWidth =
      root.children.reduce((sum, c) => sum + c.subtreeWidth, 0) + H_GAP * (root.children.length - 1);
    let cursorX = startX + (root.subtreeWidth - totalKidsWidth) / 2;
    const childY = BANNER_HEIGHT + NODE_HEIGHT + V_GAP_TOP;

    for (const child of root.children) {
      assignVerticalPositions(child, cursorX - child.relLeft, childY);
      cursorX += child.subtreeWidth + H_GAP;
    }

    const firstChildCenter = root.children[0].x + NODE_WIDTH / 2;
    const lastChildCenter = root.children[root.children.length - 1].x + NODE_WIDTH / 2;
    root.x = (firstChildCenter + lastChildCenter) / 2 - NODE_WIDTH / 2;
  };

  const totalRootsWidth =
    rootNodes.reduce((sum, r) => sum + r.subtreeWidth, 0) + H_GAP * Math.max(0, rootNodes.length - 1);

  let rootCursor = CANVAS_PAD_X;
  for (const r of rootNodes) {
    assignRootPositions(r, rootCursor);
    rootCursor += r.subtreeWidth + H_GAP;
  }

  const flatNodes: TreeNode[] = [];
  const nodeMap = new Map<string, TreeNode>();
  let maxBottom = BANNER_HEIGHT + NODE_HEIGHT;

  const collect = (node: TreeNode) => {
    flatNodes.push(node);
    nodeMap.set(node.user.id, node);
    maxBottom = Math.max(maxBottom, node.y + NODE_HEIGHT);
    for (const c of node.children) collect(c);
  };
  for (const r of rootNodes) collect(r);

  const edges: EdgeSpec[] = [];

  for (const node of flatNodes) {
    if (node.children.length === 0) continue;

    if (node.depth === 0) {
      const fromX = node.x + NODE_WIDTH / 2;
      const fromY = node.y + NODE_HEIGHT + 4;
      const midY = fromY + 22;

      for (const child of node.children) {
        const toX = child.x + NODE_WIDTH / 2;
        const toY = child.y;
        if (Math.abs(fromX - toX) < 0.5) {
          edges.push({
            id: `mgr-${node.user.id}-${child.user.id}`,
            kind: 'straight-down',
            x: fromX,
            fromY,
            toY,
          });
        } else {
          edges.push({
            id: `mgr-${node.user.id}-${child.user.id}`,
            kind: 'orthogonal-down',
            fromX,
            fromY,
            midY,
            toX,
            toY,
          });
        }
      }
      continue;
    }

    // Depth >= 1: vertical chain connectors
    if (node.children.length === 1) {
      const child = node.children[0];
      edges.push({
        id: `mgr-${node.user.id}-${child.user.id}`,
        kind: 'straight-down',
        x: node.x + NODE_WIDTH / 2,
        fromY: node.y + NODE_HEIGHT + 4,
        toY: child.y,
      });
    } else {
      const firstChildPhotoLeft = node.children[0].x + PHOTO_INSET_X;
      const railX = firstChildPhotoLeft - RAIL_GAP;
      const railStartY = node.y + NODE_HEIGHT + 6;
      const lastChild = node.children[node.children.length - 1];
      const railEndY = lastChild.y + PHOTO_SIZE / 2;

      edges.push({
        id: `spine-${node.user.id}`,
        kind: 'chain-spine',
        x: railX,
        fromY: railStartY,
        toY: railEndY,
      });

      for (const child of node.children) {
        edges.push({
          id: `mgr-${node.user.id}-${child.user.id}`,
          kind: 'chain-branch',
          fromX: railX,
          toX: child.x + PHOTO_INSET_X,
          y: child.y + PHOTO_SIZE / 2,
        });
      }
    }
  }

  for (const node of flatNodes) {
    const mentorId = node.user.mentorId;
    if (mentorId && nodeMap.has(mentorId) && mentorId !== node.user.id) {
      const mentorNode = nodeMap.get(mentorId)!;
      edges.push({
        id: `mnt-${mentorNode.user.id}-${node.user.id}`,
        kind: 'mentor',
        fromX: mentorNode.x + NODE_WIDTH / 2,
        fromY: mentorNode.y + NODE_HEIGHT,
        toX: node.x + NODE_WIDTH / 2,
        toY: node.y,
        mentorName: mentorNode.user.fullName,
      });
    }
  }

  return {
    nodes: flatNodes,
    edges,
    width: Math.max(960, totalRootsWidth + CANVAS_PAD_X * 2),
    height: maxBottom + CANVAS_PAD_BOTTOM,
    nodeMap,
  };
}

interface PortraitFrameProps {
  name: string;
  avatarUrl?: string;
  forcedLight: boolean;
}

const PortraitFrame: React.FC<PortraitFrameProps> = ({ name, avatarUrl, forcedLight }) => {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  const borderCls = forcedLight
    ? 'border-blue-600 bg-white'
    : 'border-blue-600 dark:border-blue-500 bg-white dark:bg-zinc-900';

  if (avatarUrl && !imgError) {
    return (
      <div
        style={{ width: PHOTO_SIZE, height: PHOTO_SIZE }}
        className={`mx-auto rounded-2xl border-2 overflow-hidden shadow-xs shrink-0 ${borderCls}`}
      >
        <img
          key={avatarUrl}
          src={avatarUrl}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-full h-full object-cover select-none"
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div
      style={{ width: PHOTO_SIZE, height: PHOTO_SIZE }}
      aria-label={name}
      className={`mx-auto rounded-2xl border-2 flex items-center justify-center shadow-xs shrink-0 select-none ${
        forcedLight
          ? 'border-blue-600 bg-blue-50 text-blue-700'
          : 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-200'
      }`}
    >
      <span className="text-2xl font-display font-bold tracking-tight">{getInitials(name)}</span>
    </div>
  );
};

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
  const [showMentorship, setShowMentorship] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);
  const hasInitializedRef = useRef(false);

  const computeFitState = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp || layout.width === 0 || layout.height === 0) {
      return { z: 1, x: 0, y: 0 };
    }
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const fitScale = Math.min((vw - 48) / layout.width, (vh - 48) / layout.height, 1.15);
    const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(fitScale.toFixed(2))));
    const centeredX = (vw - layout.width * clampedZoom) / 2;
    const centeredY = Math.max(16, (vh - layout.height * clampedZoom) / 2);
    return { z: clampedZoom, x: centeredX, y: centeredY };
  }, [layout.width, layout.height]);

  const computeInitialReadableState = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp || layout.width === 0 || layout.height === 0) {
      return { z: 0.9, x: 0, y: 16 };
    }
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const fitScale = Math.min((vw - 48) / layout.width, (vh - 48) / layout.height, 1.05);
    // Keep initial view large and legible while letting users fit or zoom out anytime
    const initialZoom = Math.max(0.78, Math.min(1.05, Number(fitScale.toFixed(2))));
    const centeredX = (vw - layout.width * initialZoom) / 2;
    const topOrCenteredY =
      layout.height * initialZoom <= vh - 32
        ? (vh - layout.height * initialZoom) / 2
        : 16;
    return { z: initialZoom, x: centeredX, y: topOrCenteredY };
  }, [layout.width, layout.height]);

  const fitView = useCallback(() => {
    const { z, x, y } = computeFitState();
    setZoom(z);
    setPan({ x, y });
  }, [computeFitState]);

  const setExactZoom = useCallback(
    (targetZoom: number) => {
      const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(targetZoom.toFixed(2))));
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
    },
    []
  );

  useEffect(() => {
    if (!hasInitializedRef.current && layout.nodes.length > 0) {
      hasInitializedRef.current = true;
      const { z, x, y } = computeInitialReadableState();
      setZoom(z);
      setPan({ x, y });
    }
  }, [layout.nodes.length, computeInitialReadableState]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const vp = viewportRef.current;
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number((zoom + delta).toFixed(2))));
    if (!vp) {
      setZoom(nextZoom);
      return;
    }
    const rect = vp.getBoundingClientRect();
    const anchorX = e.clientX - rect.left;
    const anchorY = e.clientY - rect.top;
    const ratio = nextZoom / zoom;
    setZoom(nextZoom);
    setPan((prevPan) => ({
      x: anchorX - (anchorX - prevPan.x) * ratio,
      y: anchorY - (anchorY - prevPan.y) * ratio,
    }));
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

  const captureChartAsJpegDataUrl = async (): Promise<string | null> => {
    if (!exportRef.current) return null;
    const imgs = Array.from(exportRef.current.querySelectorAll('img'));
    await Promise.all(
      imgs.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            })
      )
    );
    return toJpeg(exportRef.current, {
      quality: 0.96,
      pixelRatio: 2,
      backgroundColor: '#FFFFFF',
      width: layout.width,
      height: layout.height,
      skipFonts: true,
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

  const selectedDirectReports = useMemo(() => {
    if (!selectedUser) return [];
    return sortUsersByRankAndJoinDate(
      state.users.filter((u) => u.isActive && u.managerId === selectedUser.id),
      state.positions
    );
  }, [selectedUser, state.users, state.positions]);

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
    const mentorEdges = showMentorship ? layout.edges.filter((e) => e.kind === 'mentor') : [];
    const structureEdges = layout.edges.filter((e) => e.kind !== 'mentor');
    const lineStroke = forcedLight ? '#2563EB' : '#3B82F6';

    return (
      <div
        style={{ width: layout.width, height: layout.height }}
        className={`relative select-none ${
          forcedLight ? 'bg-white text-slate-900' : 'bg-transparent text-slate-900 dark:text-slate-100'
        }`}
      >
        {/* Top Centered "Department Structure" Banner with Flanking Horizontal Rules */}
        <div
          style={{ left: 48, right: 48, top: 24, height: 76 }}
          className="absolute flex items-center gap-6"
        >
          <div className={`flex-1 h-[2px] ${forcedLight ? 'bg-blue-600' : 'bg-blue-600 dark:bg-blue-500'}`} />
          <div
            className={`px-8 py-3 rounded-xl text-center shadow-sm shrink-0 ${
              forcedLight ? 'bg-blue-600 text-white' : 'bg-blue-600 dark:bg-blue-500 text-white'
            }`}
          >
            <div className="text-[15px] font-display font-semibold leading-tight tracking-tight">
              Department
            </div>
            <div className="text-[15px] font-display font-semibold leading-tight tracking-tight">
              Structure
            </div>
          </div>
          <div className={`flex-1 h-[2px] ${forcedLight ? 'bg-blue-600' : 'bg-blue-600 dark:bg-blue-500'}`} />
        </div>

        {/* SVG Hierarchy Lines & Arrowheads */}
        <svg
          width={layout.width}
          height={layout.height}
          className="absolute inset-0 pointer-events-none"
        >
          {structureEdges.map((edge) => {
            if (edge.kind === 'orthogonal-down') {
              const lineEndY = edge.toY - 8;
              return (
                <g key={edge.id}>
                  <path
                    d={`M ${edge.fromX} ${edge.fromY} L ${edge.fromX} ${edge.midY} L ${edge.toX} ${edge.midY} L ${edge.toX} ${lineEndY}`}
                    fill="none"
                    stroke={lineStroke}
                    strokeWidth={1.75}
                    strokeLinejoin="round"
                  />
                  <polygon
                    points={`${edge.toX},${edge.toY - 1} ${edge.toX - 4.5},${edge.toY - 9} ${edge.toX + 4.5},${edge.toY - 9}`}
                    fill={lineStroke}
                  />
                </g>
              );
            }

            if (edge.kind === 'straight-down') {
              const lineEndY = edge.toY - 8;
              return (
                <g key={edge.id}>
                  <line
                    x1={edge.x}
                    y1={edge.fromY}
                    x2={edge.x}
                    y2={lineEndY}
                    stroke={lineStroke}
                    strokeWidth={1.75}
                  />
                  <polygon
                    points={`${edge.x},${edge.toY - 1} ${edge.x - 4.5},${edge.toY - 9} ${edge.x + 4.5},${edge.toY - 9}`}
                    fill={lineStroke}
                  />
                </g>
              );
            }

            if (edge.kind === 'chain-spine') {
              return (
                <line
                  key={edge.id}
                  x1={edge.x}
                  y1={edge.fromY}
                  x2={edge.x}
                  y2={edge.toY}
                  stroke={lineStroke}
                  strokeWidth={1.75}
                />
              );
            }

            if (edge.kind === 'chain-branch') {
              const lineEndX = edge.toX - 8;
              return (
                <g key={edge.id}>
                  <line
                    x1={edge.fromX}
                    y1={edge.y}
                    x2={lineEndX}
                    y2={edge.y}
                    stroke={lineStroke}
                    strokeWidth={1.75}
                  />
                  <polygon
                    points={`${edge.toX - 1},${edge.y} ${edge.toX - 9},${edge.y - 4.5} ${edge.toX - 9},${edge.y + 4.5}`}
                    fill={lineStroke}
                  />
                </g>
              );
            }

            return null;
          })}

          {mentorEdges.map((edge, idx) => {
            if (edge.kind !== 'mentor') return null;
            const sameRow = Math.abs(edge.fromY - edge.toY) < NODE_HEIGHT + 16;
            const pathD = sameRow
              ? `M ${edge.fromX} ${edge.fromY} L ${edge.fromX} ${Math.max(edge.fromY, edge.toY) + 20 + (idx % 3) * 8} L ${edge.toX} ${Math.max(edge.fromY, edge.toY) + 20 + (idx % 3) * 8} L ${edge.toX} ${edge.toY + NODE_HEIGHT}`
              : `M ${edge.fromX} ${edge.fromY} L ${edge.fromX} ${edge.fromY + (edge.toY - edge.fromY) * 0.35 + (idx % 3) * 8} L ${edge.toX} ${edge.fromY + (edge.toY - edge.fromY) * 0.35 + (idx % 3) * 8} L ${edge.toX} ${edge.toY}`;
            return (
              <path
                key={edge.id}
                d={pathD}
                fill="none"
                stroke="#0284C7"
                strokeWidth={1.5}
                strokeDasharray="6 4"
                strokeLinejoin="round"
              />
            );
          })}
        </svg>

        {/* Portrait Person Nodes */}
        {layout.nodes.map((node) => {
          const mentorUser =
            showMentorship && node.user.mentorId
              ? state.users.find((u) => u.id === node.user.mentorId && u.isActive)
              : undefined;
          const isMentoringSomeone =
            showMentorship && mentorEdges.some((e) => e.kind === 'mentor' && e.mentorName === node.user.fullName);
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
                width: NODE_WIDTH,
                minHeight: NODE_HEIGHT,
              }}
              className={`group absolute flex flex-col items-center text-center focus-visible:outline-none ${
                forcedLight ? '' : 'cursor-pointer transition-transform duration-150 hover:-translate-y-0.5'
              }`}
            >
              <PortraitFrame
                name={node.user.fullName}
                avatarUrl={node.user.avatarUrl}
                forcedLight={forcedLight}
              />

              <div className="mt-2.5 w-full px-1">
                <div
                  className={`text-[14.5px] font-display font-bold leading-snug tracking-tight break-words ${
                    forcedLight
                      ? 'text-slate-900'
                      : 'text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400'
                  }`}
                >
                  {node.user.fullName}
                </div>
                <div
                  className={`mt-0.5 text-[12px] leading-snug break-words line-clamp-2 ${
                    forcedLight ? 'text-slate-500' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {roleTitle}
                </div>
                {showMentorship && (mentorUser || isMentoringSomeone) && (
                  <div className="mt-1 text-[10.5px] font-medium text-sky-600 dark:text-sky-400">
                    {[isMentoringSomeone ? 'Mentor' : '', mentorUser ? 'Mentee' : '']
                      .filter(Boolean)
                      .join(' · ')}
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
            onClick={() => setExactZoom(zoom - 0.15)}
            disabled={zoom <= MIN_ZOOM}
            className="p-1.5 rounded-lg border border-neutral-200 dark:border-zinc-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-zinc-900 disabled:opacity-40"
            aria-label="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </button>

          <input
            type="range"
            min={Math.round(MIN_ZOOM * 100)}
            max={Math.round(MAX_ZOOM * 100)}
            step={5}
            value={Math.round(zoom * 100)}
            onChange={(e) => setExactZoom(Number(e.target.value) / 100)}
            className="w-24 sm:w-36 accent-blue-600"
            aria-label="Zoom percentage slider"
          />

          <span className="w-12 text-center font-mono-tabular text-xs font-semibold text-neutral-700 dark:text-neutral-200">
            {Math.round(zoom * 100)}%
          </span>

          <button
            type="button"
            onClick={() => setExactZoom(zoom + 0.15)}
            disabled={zoom >= MAX_ZOOM}
            className="p-1.5 rounded-lg border border-neutral-200 dark:border-zinc-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-zinc-900 disabled:opacity-40"
            aria-label="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setExactZoom(1)}
            className="ml-1 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-mono-tabular font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-zinc-900 whitespace-nowrap"
          >
            100%
          </button>

          <button
            type="button"
            onClick={fitView}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-zinc-900 whitespace-nowrap"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span>Fit View</span>
          </button>

          <button
            type="button"
            onClick={() => setShowMentorship((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap transition-colors ${
              showMentorship
                ? 'border-sky-600 bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300'
                : 'border-neutral-200 dark:border-zinc-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-zinc-900'
            }`}
          >
            <UserCheck className="h-3.5 w-3.5" />
            <span>Mentorship Lines</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={exporting}
            onClick={handleExportJpeg}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-zinc-900 disabled:opacity-50 whitespace-nowrap"
          >
            <FileImage className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            <span>{exporting ? 'Exporting...' : 'Export JPEG'}</span>
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={handleExportPdf}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{exporting ? 'Exporting...' : 'Export PDF'}</span>
          </button>
        </div>
      </div>

      {/* Large Interactive Pan/Zoom Canvas */}
      <div
        ref={viewportRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`relative w-full h-[calc(100vh-205px)] min-h-[680px] rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#050507] overflow-hidden touch-none ${
          isPanning ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(148, 163, 184, 0.16) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
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

        <div className="pointer-events-none absolute bottom-3 left-4 text-[11px] text-neutral-400 dark:text-neutral-500">
          Drag to move · Scroll to zoom · Click a portrait for profile details
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
                <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
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
                  <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
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
                    {selectedDirectReports.map((rep) => (
                      <button
                        key={rep.id}
                        type="button"
                        onClick={() => setSelectedUserId(rep.id)}
                        className="px-2.5 py-1 rounded-md border border-neutral-200 dark:border-zinc-800 hover:border-blue-500 text-neutral-700 dark:text-neutral-200"
                      >
                        {rep.fullName}
                      </button>
                    ))}
                    {selectedDirectReports.length === 0 && (
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
