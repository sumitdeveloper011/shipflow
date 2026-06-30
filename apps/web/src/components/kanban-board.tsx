"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Task = {
  id: string;
  title: string;
  description: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  labels: string[];
  order: number;
};

const COLUMNS = [
  { id: "TODO", label: "To Do" },
  { id: "IN_PROGRESS", label: "In Progress" },
  { id: "DONE", label: "Done" },
] as const;

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};

export function KanbanBoard({
  tasks,
  prdId,
  onTaskChange,
}: {
  tasks: Task[];
  prdId: string;
  onTaskChange?: (tasks: Task[]) => void;
}) {
  const [localTasks, setLocalTasks] = useState(tasks);
  const [dragging, setDragging] = useState<string | null>(null);
  const updateStatus = trpc.task.updateStatus.useMutation();

  function onDragStart(taskId: string) {
    setDragging(taskId);
  }

  function onDrop(status: Task["status"]) {
    if (!dragging) return;
    const task = localTasks.find((t) => t.id === dragging);
    if (!task || task.status === status) {
      setDragging(null);
      return;
    }

    const updated = localTasks.map((t) =>
      t.id === dragging ? { ...t, status } : t
    );
    setLocalTasks(updated);
    onTaskChange?.(updated);
    updateStatus.mutate({ taskId: dragging, status });
    setDragging(null);
  }

  const grouped = COLUMNS.reduce(
    (acc, col) => {
      acc[col.id] = localTasks
        .filter((t) => t.status === col.id)
        .sort((a, b) => a.order - b.order);
      return acc;
    },
    {} as Record<string, Task[]>
  );

  const total = localTasks.length;
  const done = grouped["DONE"].length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-500"
            style={{ width: pct + "%" }}
          />
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {done}/{total} done ({pct}%)
        </span>
      </div>

      {/* Kanban columns */}
      <div className="grid grid-cols-3 gap-4 min-h-96">
        {COLUMNS.map((col) => (
          <div
            key={col.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(col.id)}
            className="flex flex-col"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">{col.label}</h3>
              <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                {grouped[col.id].length}
              </span>
            </div>

            <div className="flex-1 bg-secondary/30 rounded-xl p-2 space-y-2 min-h-40">
              {grouped[col.id].map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={() => onDragStart(task.id)}
                  className={cn(
                    "bg-card border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing select-none",
                    "hover:shadow-sm transition-shadow",
                    dragging === task.id && "opacity-50"
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-medium leading-snug flex-1">
                      {task.title}
                    </p>
                    <span
                      className={cn(
                        "text-xs px-1.5 py-0.5 rounded text-nowrap shrink-0",
                        PRIORITY_COLORS[task.priority]
                      )}
                    >
                      {task.priority}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                    {task.description}
                  </p>
                  {task.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {task.labels.map((label) => (
                        <span
                          key={label}
                          className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {grouped[col.id].length === 0 && (
                <div className="h-24 flex items-center justify-center text-xs text-muted-foreground/50 border-2 border-dashed border-border/40 rounded-lg">
                  Drop here
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
