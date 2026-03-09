"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import { alpha } from "@mui/material/styles";
import AccountTreeRoundedIcon from "@mui/icons-material/AccountTreeRounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import CommitRoundedIcon from "@mui/icons-material/CommitRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import SummarizeRoundedIcon from "@mui/icons-material/SummarizeRounded";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import FiberManualRecordRoundedIcon from "@mui/icons-material/FiberManualRecordRounded";
import type { AgentSession, AgentActivityLog } from "@/hooks/useAgentSession";

const LOG_TYPE_CONFIG: Record<
  AgentActivityLog["log_type"],
  { icon: React.ReactNode; color: string; label: string }
> = {
  info: { icon: <InfoOutlinedIcon sx={{ fontSize: 16 }} />, color: "#448AFF", label: "Info" },
  commit: { icon: <CommitRoundedIcon sx={{ fontSize: 16 }} />, color: "#69F0AE", label: "Commit" },
  file_change: {
    icon: <InsertDriveFileOutlinedIcon sx={{ fontSize: 16 }} />,
    color: "#FFD740",
    label: "File",
  },
  error: {
    icon: <ErrorOutlineRoundedIcon sx={{ fontSize: 16 }} />,
    color: "#FF5252",
    label: "Error",
  },
  summary: {
    icon: <SummarizeRoundedIcon sx={{ fontSize: 16 }} />,
    color: "#E040FB",
    label: "Summary",
  },
};

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

interface AgentActivityTabProps {
  session: AgentSession | null;
  logs: AgentActivityLog[];
  isStreaming?: boolean;
}

export default function AgentActivityTab({ session, logs, isStreaming = false }: AgentActivityTabProps) {
  if (!session) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 1,
        }}
      >
        <SmartToyRoundedIcon sx={{ fontSize: 48, color: "text.disabled" }} />
        <Typography variant="body2" sx={{ color: "text.disabled" }}>
          Session loading...
        </Typography>
      </Box>
    );
  }

  const statusColor =
    session.status === "active" ? "#4CAF50" : session.status === "error" ? "#FF5252" : "#9E9E9E";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", bgcolor: "#1A1A1A" }}>
      {/* Session header */}
      <Box
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          flexDirection: "column",
          gap: 1,
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <FiberManualRecordRoundedIcon sx={{ fontSize: 10, color: statusColor }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {session.agent_name ?? "Claude"}
          </Typography>
          <Chip
            label={session.status}
            size="small"
            sx={{
              height: 20,
              fontSize: "0.65rem",
              fontWeight: 600,
              bgcolor: alpha(statusColor, 0.12),
              color: statusColor,
            }}
          />
          <Typography variant="caption" sx={{ ml: "auto", color: "text.disabled" }}>
            {formatDate(session.started_at)}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <FolderRoundedIcon sx={{ fontSize: 14, color: "text.disabled" }} />
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {session.project_name}
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
                "& .MuiChip-icon": { color: "#00E5FF" },
              }}
            />
          )}
        </Box>
      </Box>

      {/* Activity timeline */}
      <Box sx={{ flex: 1, overflow: "auto", px: 2, py: 1.5 }}>
        {logs.length === 0 && !isStreaming ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              py: 8,
              gap: 1,
            }}
          >
            <SummarizeRoundedIcon sx={{ fontSize: 36, color: "text.disabled" }} />
            <Typography variant="caption" sx={{ color: "text.disabled" }}>
              No activity yet
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {logs.map((log, i) => {
              const cfg = LOG_TYPE_CONFIG[log.log_type];
              const isLast = i === logs.length - 1 && !isStreaming;
              return (
                <Box key={log.id} sx={{ display: "flex", gap: 1.5, position: "relative" }}>
                  {/* Timeline line */}
                  {!isLast && (
                    <Box
                      sx={{
                        position: "absolute",
                        left: 11,
                        top: 28,
                        bottom: 0,
                        width: 1,
                        bgcolor: alpha(cfg.color, 0.2),
                      }}
                    />
                  )}
                  {/* Icon */}
                  <Box
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      bgcolor: alpha(cfg.color, 0.12),
                      color: cfg.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      mt: 0.25,
                    }}
                  >
                    {cfg.icon}
                  </Box>
                  {/* Content */}
                  <Box sx={{ flex: 1, pb: 2, minWidth: 0 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.25 }}>
                      <Chip
                        label={cfg.label}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: "0.6rem",
                          fontWeight: 700,
                          bgcolor: alpha(cfg.color, 0.1),
                          color: cfg.color,
                        }}
                      />
                      <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.65rem" }}>
                        {formatTime(log.created_at)}
                      </Typography>
                    </Box>
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: "0.8rem",
                        color: "text.primary",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {log.content}
                    </Typography>
                  </Box>
                </Box>
              );
            })}

            {/* Streaming indicator */}
            {isStreaming && (
              <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
                <Box
                  sx={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    bgcolor: alpha("#7C5CFF", 0.12),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <SmartToyRoundedIcon sx={{ fontSize: 14, color: "#7C5CFF" }} />
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <Typography variant="caption" sx={{ color: "#7C5CFF", fontWeight: 600, fontSize: "0.75rem" }}>
                    Claude is working
                  </Typography>
                  <Box sx={{ display: "flex", gap: 0.4, alignItems: "center" }}>
                    {[0, 1, 2].map((i) => (
                      <Box
                        key={i}
                        sx={{
                          width: 4,
                          height: 4,
                          borderRadius: "50%",
                          bgcolor: "#7C5CFF",
                          animation: "dotPulse 1.4s ease-in-out infinite",
                          animationDelay: `${i * 0.2}s`,
                          "@keyframes dotPulse": {
                            "0%, 80%, 100%": { opacity: 0.3, transform: "scale(0.8)" },
                            "40%": { opacity: 1, transform: "scale(1)" },
                          },
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              </Box>
            )}
          </Box>
        )}
      </Box>

    </Box>
  );
}
