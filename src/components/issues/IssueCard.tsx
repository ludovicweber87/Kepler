"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, type PanInfo } from "framer-motion";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Avatar from "@mui/material/Avatar";
import { alpha } from "@mui/material/styles";
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import { GitHubIssue } from "@/types";

const springTransition = { type: "spring" as const, stiffness: 500, damping: 35 };

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  return `${diffDays}d ago`;
}

interface IssueCardProps {
  issue: GitHubIssue;
  isDraggable?: boolean;
  isDragging?: boolean;
  onDragStart?: () => void;
  onDrag?: (event: PointerEvent, info: PanInfo) => void;
  onDragEnd?: (event: PointerEvent, info: PanInfo) => void;
}

export default function IssueCard({
  issue,
  isDraggable = false,
  isDragging = false,
  onDragStart,
  onDrag,
  onDragEnd,
}: IssueCardProps) {
  const router = useRouter();
  const [owner, repo] = (issue.repo_full_name ?? "").split("/");
  const href = `/task/${owner}/${repo}/${issue.number}`;
  const hasDragged = useRef(false);

  const cardContent = (
    <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 0.75 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.35, flex: 1, mr: 1 }}>
          {issue.title}
        </Typography>
        {issue.assignee && (
          <Avatar
            src={issue.assignee.avatar_url}
            alt={issue.assignee.login}
            sx={{ width: 24, height: 24, flexShrink: 0 }}
          />
        )}
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.75 }}>
        <FolderOpenRoundedIcon sx={{ fontSize: 12, color: "text.secondary" }} />
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {repo}
        </Typography>
        <Typography variant="caption" sx={{ color: "text.disabled" }}>
          #{issue.number}
        </Typography>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
        {issue.labels.slice(0, 2).map((label) => (
          <Chip
            key={label.name}
            label={label.name}
            size="small"
            sx={{
              height: 20,
              fontSize: "0.675rem",
              bgcolor: alpha(`#${label.color}`, 0.15),
              color: `#${label.color}`,
            }}
          />
        ))}
        <Box sx={{ flexGrow: 1 }} />
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <AccessTimeRoundedIcon sx={{ fontSize: 12, color: "text.disabled" }} />
          <Typography variant="caption" sx={{ fontSize: "0.675rem", color: "text.disabled" }}>
            {formatRelativeDate(issue.updated_at)}
          </Typography>
        </Box>
      </Box>
    </CardContent>
  );

  if (!isDraggable) {
    return (
      <Card
        onClick={() => router.push(href)}
        sx={{
          cursor: "pointer",
          borderRadius: 1,
          transition: "transform 0.15s, box-shadow 0.15s",
          "&:hover": { transform: "translateY(-1px)", boxShadow: 4 },
        }}
      >
        {cardContent}
      </Card>
    );
  }

  return (
    <motion.div
      layout="position"
      drag
      dragSnapToOrigin
      whileDrag={{
        scale: 1.02,
        boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
        zIndex: 50,
      }}
      onDragStart={() => {
        hasDragged.current = true;
        onDragStart?.();
      }}
      onDrag={(event, info) => onDrag?.(event as unknown as PointerEvent, info)}
      onDragEnd={(event, info) => {
        onDragEnd?.(event as unknown as PointerEvent, info);
        requestAnimationFrame(() => {
          hasDragged.current = false;
        });
      }}
      onClick={() => {
        if (!hasDragged.current) {
          router.push(href);
        }
      }}
      style={{
        cursor: isDragging ? "grabbing" : "grab",
        position: "relative",
        zIndex: isDragging ? 50 : "auto",
      }}
      transition={springTransition}
    >
      <Card
        sx={{
          pointerEvents: "none",
          borderRadius: 1,
          transition: "box-shadow 0.15s",
        }}
      >
        {cardContent}
      </Card>
    </motion.div>
  );
}
