"use client";

import { useMemo } from "react";
import { useStore } from "@/store/useStore";
import type { Area, Project, Tag } from "@/lib/domain/types";

/**
 * 列表容器用：一次订阅并构建查找 Map，传给每个 TaskItem，
 * 避免每个任务行重复 find（O(n²) → O(n)）。
 */
export interface TaskMeta {
  projectMap: Map<string, Project>;
  areaMap: Map<string, Area>;
  tagMap: Map<string, Tag>;
}

export function useTaskMeta(): TaskMeta {
  const projects = useStore((s) => s.projects);
  const areas = useStore((s) => s.areas);
  const tags = useStore((s) => s.tags);
  return useMemo(
    () => ({
      projectMap: new Map(projects.map((p) => [p.id, p])),
      areaMap: new Map(areas.map((a) => [a.id, a])),
      tagMap: new Map(tags.map((t) => [t.id, t])),
    }),
    [projects, areas, tags],
  );
}
