"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { changeClientStatus } from "../_crm-actions";
import type { PracticeClientStatus } from "@/lib/db/schema";

type Card = {
  id: string;
  displayInitials: string;
  preferredFirstName: string | null;
  primaryCounselorName: string | null;
  lastSessionAt: string | null;
  totalSessions: number;
};

const STATUS_COLUMNS: { id: PracticeClientStatus; label: string; tone: string }[] = [
  { id: "lead", label: "Lead", tone: "bg-[#fbf6ea] border-[#ecdcb1] text-[#7a5712]" },
  { id: "scheduling", label: "Scheduling", tone: "bg-[#eef2f7] border-[#cfd9e6] text-[#334155]" },
  { id: "confirmed", label: "Confirmed", tone: "bg-[#eff5f0] border-[#cfe0d2] text-[#3a5a40]" },
  { id: "in_progress", label: "In progress", tone: "bg-[#fef9e7] border-[#f5d76e] text-[#8a6d3b]" },
  { id: "discharged", label: "Discharged", tone: "bg-[#f1f5f9] border-[#cbd5e1] text-[#475569]" },
  { id: "lost", label: "Lost", tone: "bg-[#f5e8e9] border-[#ebcacb] text-[#8b3a3f]" },
];

export function Board({
  cardsByStatus,
}: {
  cardsByStatus: Record<PracticeClientStatus, Card[]>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<PracticeClientStatus | null>(null);

  function onDragStart(e: React.DragEvent, id: string) {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }
  function onDragOver(e: React.DragEvent, col: PracticeClientStatus) {
    e.preventDefault();
    setHoverCol(col);
  }
  function onDrop(e: React.DragEvent, col: PracticeClientStatus) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    setHoverCol(null);
    setDraggingId(null);
    if (!id) return;
    startTransition(async () => {
      await changeClientStatus(id, col);
      router.refresh();
    });
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-3 min-w-[1100px]">
        {STATUS_COLUMNS.map((col) => {
          const cards = cardsByStatus[col.id] ?? [];
          const isHover = hoverCol === col.id;
          return (
            <div
              key={col.id}
              onDragOver={(e) => onDragOver(e, col.id)}
              onDragLeave={() => setHoverCol(null)}
              onDrop={(e) => onDrop(e, col.id)}
              className={[
                "flex-1 min-w-[200px] rounded-2xl border bg-white p-3 flex flex-col",
                col.tone,
                isHover ? "ring-2 ring-[var(--accent)]" : "",
              ].join(" ")}
            >
              <div className="flex items-baseline justify-between mb-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em]">
                  {col.label}
                </div>
                <div className="text-xs tabular text-[var(--muted)]">
                  {cards.length}
                </div>
              </div>
              <div className="flex flex-col gap-2 min-h-[40px]">
                {cards.map((c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, c.id)}
                    className={[
                      "rounded-lg bg-white border border-[var(--border)] p-3 cursor-grab text-sm shadow-[0_2px_8px_rgba(15,23,42,0.05)] hover:shadow-[0_4px_16px_rgba(15,23,42,0.10)] transition-shadow",
                      draggingId === c.id ? "opacity-50" : "",
                    ].join(" ")}
                  >
                    <Link
                      href={`/practice/clients/${c.id}`}
                      className="block"
                    >
                      <div className="font-semibold text-[var(--foreground)]">
                        {c.displayInitials}
                        {c.preferredFirstName && (
                          <span className="text-[var(--muted)] font-normal ml-1">
                            ({c.preferredFirstName})
                          </span>
                        )}
                      </div>
                      {c.primaryCounselorName && (
                        <div className="text-[10px] text-[var(--muted)] mt-1">
                          {c.primaryCounselorName}
                        </div>
                      )}
                      <div className="text-[10px] text-[var(--muted)] tabular mt-1">
                        {c.totalSessions} session
                        {c.totalSessions === 1 ? "" : "s"}
                        {c.lastSessionAt && ` · last ${c.lastSessionAt.slice(0, 10)}`}
                      </div>
                    </Link>
                  </div>
                ))}
                {cards.length === 0 && (
                  <div className="text-[10px] italic text-[var(--muted)] py-2 text-center">
                    Empty
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
