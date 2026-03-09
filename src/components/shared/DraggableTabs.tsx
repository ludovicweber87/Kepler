"use client";

import { useRef, useState } from "react";
import Box from "@mui/material/Box";
import { alpha } from "@mui/material/styles";

interface DraggableTabsProps {
  tabs: string[];
  activeTab: number;
  onTabChange: (index: number) => void;
  onReorder: (newOrder: string[]) => void;
  counts?: number[];
  /** Accent color — defaults to #7C5CFF */
  color?: string;
  /** Trailing element (e.g. Add button) */
  trailing?: React.ReactNode;
}

export default function DraggableTabs({
  tabs,
  activeTab,
  onTabChange,
  onReorder,
  counts,
  color = "#7C5CFF",
  trailing,
}: DraggableTabsProps) {
  const dragIdx = useRef<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  const handleDragStart = (idx: number) => (e: React.DragEvent) => {
    dragIdx.current = idx;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  };

  const handleDragOver = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIdx.current !== null && dragIdx.current !== idx) {
      setDropTarget(idx);
    }
  };

  const handleDrop = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    setDropTarget(null);
    const from = dragIdx.current;
    if (from === null || from === idx) return;
    const newTabs = [...tabs];
    const [moved] = newTabs.splice(from, 1);
    newTabs.splice(idx, 0, moved);
    const activeName = tabs[activeTab];
    const newActiveIdx = newTabs.indexOf(activeName);
    onReorder(newTabs);
    if (newActiveIdx !== activeTab) {
      onTabChange(newActiveIdx);
    }
    dragIdx.current = null;
  };

  const handleDragEnd = () => {
    dragIdx.current = null;
    setDropTarget(null);
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        mb: 3,
        overflowX: "auto",
        "&::-webkit-scrollbar": { display: "none" },
      }}
    >
      {tabs.map((tab, idx) => {
        const isActive = idx === activeTab;
        const isDropTarget = dropTarget === idx;
        return (
          <Box
            key={tab}
            draggable
            onDragStart={handleDragStart(idx)}
            onDragOver={handleDragOver(idx)}
            onDrop={handleDrop(idx)}
            onDragEnd={handleDragEnd}
            onClick={() => onTabChange(idx)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              px: 2,
              py: 1,
              borderRadius: 1,
              cursor: "grab",
              userSelect: "none",
              whiteSpace: "nowrap",
              fontSize: "0.85rem",
              fontWeight: 500,
              transition: "background-color 0.15s, transform 0.15s, box-shadow 0.15s",
              bgcolor: isActive ? alpha(color, 0.18) : "transparent",
              color: isActive ? color : "text.secondary",
              border: 1,
              borderColor: isDropTarget
                ? alpha(color, 0.5)
                : isActive
                  ? alpha(color, 0.25)
                  : "transparent",
              "&:hover": {
                bgcolor: alpha(color, isActive ? 0.22 : 0.08),
              },
              "&:active": {
                cursor: "grabbing",
                transform: "scale(0.97)",
              },
            }}
          >
            {tab}
            {counts && counts[idx] !== undefined && (
              <Box
                component="span"
                sx={{
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  bgcolor: alpha(color, 0.15),
                  color: isActive ? color : "text.secondary",
                  borderRadius: 1,
                  px: 0.75,
                  py: 0.15,
                  minWidth: 18,
                  textAlign: "center",
                }}
              >
                {counts[idx]}
              </Box>
            )}
          </Box>
        );
      })}
      {trailing}
    </Box>
  );
}
