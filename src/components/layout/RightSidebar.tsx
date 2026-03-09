"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import { alpha } from "@mui/material/styles";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import FiberManualRecordRoundedIcon from "@mui/icons-material/FiberManualRecordRounded";
import AccountTreeRoundedIcon from "@mui/icons-material/AccountTreeRounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import { useActiveSessions, type ActiveSession } from "@/hooks/useActiveSessions";
import { useAgentViews } from "@/hooks/useAgentViews";
import { useRightSidebar } from "@/hooks/useRightSidebar";
import AgentTerminalModal from "@/components/agents/AgentTerminalModal";

export const RIGHT_SIDEBAR_WIDTH = 280;
const MIN_WIDTH = 220;
const MAX_WIDTH = 380;

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function SessionCard({
  session,
  onClick,
}: {
  session: ActiveSession;
  onClick: () => void;
}) {
  return (
    <Box
      onClick={onClick}
      sx={{
        p: 1.5,
        borderRadius: 1,
        bgcolor: alpha("#7C5CFF", 0.06),
        border: 1,
        borderColor: alpha("#7C5CFF", 0.12),
        cursor: "pointer",
        transition: "all 0.15s",
        "&:hover": {
          bgcolor: alpha("#7C5CFF", 0.12),
          borderColor: alpha("#7C5CFF", 0.25),
          transform: "translateX(-2px)",
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
        <FiberManualRecordRoundedIcon
          sx={{ fontSize: 8, color: session.isActive ? "#4CAF50" : "#FF9800" }}
        />
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            fontSize: "0.8rem",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {session.agentName ?? "Claude"}
        </Typography>
        <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.6rem" }}>
          {timeAgo(session.lastActivity)}
        </Typography>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
        <FolderRoundedIcon sx={{ fontSize: 12, color: "text.disabled" }} />
        <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.7rem" }}>
          {session.projectName}
        </Typography>
      </Box>

      {session.branch && (
        <Chip
          icon={<AccountTreeRoundedIcon sx={{ fontSize: "12px !important" }} />}
          label={session.branch}
          size="small"
          sx={{
            height: 20,
            fontSize: "0.65rem",
            bgcolor: alpha("#00E5FF", 0.1),
            color: "#00E5FF",
            border: 1,
            borderColor: alpha("#00E5FF", 0.2),
            "& .MuiChip-icon": { color: "#00E5FF" },
          }}
        />
      )}
    </Box>
  );
}

export default function RightSidebar() {
  const { open, width, setWidth } = useRightSidebar();
  const { data: allSessions = [] } = useActiveSessions();
  const sessions = allSessions.filter((s) => s.isActive);
  const { views } = useAgentViews();
  const [selectedSession, setSelectedSession] = useState<ActiveSession | null>(null);
  const [tabIndex, setTabIndex] = useState(0);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);

  const filteredSessions = useMemo(() => {
    if (tabIndex === 0) return sessions;
    const view = views[tabIndex - 1];
    if (!view) return sessions;
    return sessions.filter((s) => s.cwd.startsWith(view.path));
  }, [sessions, views, tabIndex]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      startXRef.current = e.clientX;
      startWidthRef.current = width;

      const handleMouseMove = (ev: MouseEvent) => {
        const delta = startXRef.current - ev.clientX;
        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + delta));
        setWidth(newWidth);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [width, setWidth]
  );

  return (
    <>
      <Drawer
        variant="persistent"
        anchor="right"
        open={open}
        sx={{
          width: open ? width : 0,
          flexShrink: 0,
          transition: isResizing ? "none" : "width 0.2s",
          "& .MuiDrawer-paper": {
            width,
            boxSizing: "border-box",
            borderLeft: 1,
            borderColor: "divider",
            mt: "64px",
            transition: isResizing ? "none" : "width 0.2s",
            overflow: "visible",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        {/* Resize handle */}
        <Box
          onMouseDown={handleMouseDown}
          sx={{
            position: "absolute",
            top: 0,
            left: -3,
            bottom: 0,
            width: 6,
            cursor: "col-resize",
            zIndex: 1300,
            "&::after": {
              content: '""',
              position: "absolute",
              top: 0,
              left: 2,
              bottom: 0,
              width: 2,
              transition: "background-color 0.15s",
            },
            "&:hover::after, &:active::after": {
              bgcolor: "#7C5CFF",
            },
          }}
        />

        {/* Header */}
        <Box sx={{ px: 2, pt: 2, pb: 1, flexShrink: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <SmartToyRoundedIcon sx={{ color: "#7C5CFF", fontSize: "1.1rem" }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, letterSpacing: 0.5 }}>
              Active Agents
            </Typography>
            {sessions.length > 0 && (
              <Box
                sx={{
                  ml: "auto",
                  bgcolor: alpha("#4CAF50", 0.15),
                  color: "#4CAF50",
                  fontSize: "0.65rem",
                  fontWeight: 700,
                  px: 0.75,
                  py: 0.15,
                  borderRadius: 1,
                }}
              >
                {sessions.length}
              </Box>
            )}
          </Box>
        </Box>

        {/* View tabs */}
        {views.length > 0 && (
          <Tabs
            value={tabIndex}
            onChange={(_, v) => setTabIndex(v)}
            variant="scrollable"
            scrollButtons={false}
            sx={{
              minHeight: 32,
              px: 1,
              flexShrink: 0,
              borderBottom: 1,
              borderColor: "divider",
              "& .MuiTab-root": {
                minHeight: 32,
                minWidth: 0,
                px: 1.5,
                py: 0.5,
                fontSize: "0.7rem",
                fontWeight: 600,
                textTransform: "none",
                color: "text.secondary",
                "&.Mui-selected": { color: "#7C5CFF" },
              },
              "& .MuiTabs-indicator": {
                bgcolor: "#7C5CFF",
                height: 2,
              },
            }}
          >
            <Tab label="All" />
            {views.map((view) => {
              const count = sessions.filter((s) => s.cwd.startsWith(view.path)).length;
              return (
                <Tab
                  key={view.repoFullName}
                  label={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      {view.label}
                      {count > 0 && (
                        <Box
                          sx={{
                            bgcolor: alpha("#4CAF50", 0.15),
                            color: "#4CAF50",
                            fontSize: "0.6rem",
                            fontWeight: 700,
                            px: 0.5,
                            borderRadius: 1,
                            lineHeight: 1.4,
                          }}
                        >
                          {count}
                        </Box>
                      )}
                    </Box>
                  }
                />
              );
            })}
          </Tabs>
        )}

        {/* Session list */}
        <Box sx={{ p: 2, overflow: "auto", flex: 1 }}>
          {filteredSessions.length === 0 ? (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                py: 6,
                gap: 1,
              }}
            >
              <SmartToyRoundedIcon sx={{ fontSize: 36, color: "text.disabled" }} />
              <Typography variant="caption" sx={{ color: "text.disabled", textAlign: "center" }}>
                {tabIndex === 0 ? "No active sessions" : "No sessions on this project"}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {filteredSessions.map((session) => (
                <SessionCard
                  key={session.sessionId}
                  session={session}
                  onClick={() => setSelectedSession(session)}
                />
              ))}
            </Box>
          )}
        </Box>
      </Drawer>

      <AgentTerminalModal
        open={!!selectedSession}
        onClose={() => setSelectedSession(null)}
        projectPath={selectedSession?.cwd}
        existingSessionId={selectedSession?.sessionId}
      />
    </>
  );
}
