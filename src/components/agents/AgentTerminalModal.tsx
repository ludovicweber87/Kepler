"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import { alpha } from "@mui/material/styles";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import TerminalRoundedIcon from "@mui/icons-material/TerminalRounded";
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import FiberManualRecordRoundedIcon from "@mui/icons-material/FiberManualRecordRounded";
import TimelineRoundedIcon from "@mui/icons-material/TimelineRounded";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { AgentFile } from "@/hooks/useAgentFiles";
import { useAgentSession } from "@/hooks/useAgentSession";
import AgentActivityTab from "./AgentActivityTab";

interface AgentTerminalModalProps {
  open: boolean;
  onClose: () => void;
  projectPath?: string;
  agentFile?: AgentFile;
  existingSessionId?: string;
}

function buildSessionId(projectPath?: string, agentFile?: AgentFile): string {
  const base = projectPath?.replace(/[^a-zA-Z0-9]/g, "-") ?? "unknown";
  const suffix =
    agentFile?.filename?.replace(/\.md$/, "").replace(/[^a-zA-Z0-9]/g, "-") ?? "session";
  return `devora-${base}-${suffix}`;
}

export default function AgentTerminalModal({
  open,
  onClose,
  projectPath,
  agentFile,
  existingSessionId,
}: AgentTerminalModalProps) {
  const [termNode, setTermNode] = useState<HTMLDivElement | null>(null);
  const [resumed, setResumed] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const terminalRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const sessionId = existingSessionId ?? buildSessionId(projectPath, agentFile);
  const { session, logs, ensureSession, addLog } = useAgentSession(open ? sessionId : undefined);

  // Ensure DB session exists when modal opens
  useEffect(() => {
    if (!open || !projectPath || !sessionId) return;
    const projectName = projectPath.split("/").filter(Boolean).pop() ?? "unknown";
    ensureSession({
      sessionId,
      projectPath,
      projectName,
      agentName: agentFile?.name ?? null,
    });
  }, [open, sessionId, projectPath, agentFile, ensureSession]);

  // Refit terminal when switching back to Terminal tab
  useEffect(() => {
    if (activeTab === 0 && fitAddonRef.current) {
      requestAnimationFrame(() => fitAddonRef.current?.fit());
    }
  }, [activeTab]);

  useEffect(() => {
    if (!open || !projectPath || !termNode) return;

    setResumed(false);

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      theme: {
        background: "#1A1A1A",
        foreground: "#E0E0E0",
        cursor: "#7C4DFF",
        selectionBackground: "rgba(124, 77, 255, 0.3)",
        black: "#1A1A1A",
        red: "#FF5252",
        green: "#69F0AE",
        yellow: "#FFD740",
        blue: "#448AFF",
        magenta: "#E040FB",
        cyan: "#00E5FF",
        white: "#E0E0E0",
        brightBlack: "#616161",
        brightRed: "#FF8A80",
        brightGreen: "#B9F6CA",
        brightYellow: "#FFE57F",
        brightBlue: "#82B1FF",
        brightMagenta: "#EA80FC",
        brightCyan: "#84FFFF",
        brightWhite: "#FFFFFF",
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(termNode);

    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const ws = new WebSocket("ws://localhost:4001");
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "init",
          sessionId,
          cwd: projectPath,
          cols: terminal.cols,
          rows: terminal.rows,
        })
      );
    };

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "init-ack") {
            setResumed(msg.resumed);
            if (!msg.resumed && agentFile) {
              const escaped = agentFile.content.replace(/'/g, "'\\''");
              const cmd = `claude --system-prompt '${escaped}'\n`;
              setTimeout(() => {
                ws.send(JSON.stringify({ type: "input", data: cmd }));
              }, 500);
            }
            return;
          }
        } catch {
          // Not JSON — terminal output
        }
        terminal.write(event.data);
      }
    };

    ws.onclose = () => {
      terminal.write("\r\n\x1b[90m[Session disconnected]\x1b[0m\r\n");
    };

    terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    const observer = new ResizeObserver(() => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "resize",
            cols: terminal.cols,
            rows: terminal.rows,
          })
        );
      }
    });
    observer.observe(termNode);

    return () => {
      observer.disconnect();
      ws.close();
      terminal.dispose();
      terminalRef.current = null;
      wsRef.current = null;
      fitAddonRef.current = null;
    };
  }, [open, projectPath, agentFile, termNode, sessionId]);

  const handleAddLog = useCallback(
    (content: string, logType?: "info" | "commit" | "file_change" | "error" | "summary") => {
      addLog(content, logType);
    },
    [addLog]
  );

  const folderName = projectPath?.split("/").filter(Boolean).pop() ?? "";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: "#1E1E1E",
          maxWidth: 1000,
          height: "80vh",
          borderRadius: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pb: 0,
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
          {agentFile ? (
            <DescriptionRoundedIcon sx={{ color: "#7C5CFF" }} />
          ) : (
            <TerminalRoundedIcon sx={{ color: "#00E5FF" }} />
          )}
          <Typography variant="subtitle1" sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
            {agentFile ? agentFile.name : existingSessionId ? "Active Session" : "New Session"}
          </Typography>
          {resumed && (
            <Chip
              icon={
                <FiberManualRecordRoundedIcon
                  sx={{ fontSize: "10px !important", color: "#4CAF50 !important" }}
                />
              }
              label="Resumed"
              size="small"
              sx={{
                height: 22,
                fontSize: "0.65rem",
                bgcolor: "rgba(76, 175, 80, 0.12)",
                color: "#4CAF50",
                fontWeight: 600,
              }}
            />
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
          <Chip
            icon={<FolderOpenRoundedIcon sx={{ fontSize: "14px !important" }} />}
            label={folderName}
            size="small"
            sx={{
              height: 24,
              fontSize: "0.7rem",
              bgcolor: "rgba(255,255,255,0.05)",
              "& .MuiChip-icon": { color: "text.secondary" },
            }}
          />
          <IconButton size="small" onClick={onClose} sx={{ color: "text.secondary" }}>
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{
          minHeight: 36,
          px: 2,
          borderBottom: 1,
          borderColor: "divider",
          flexShrink: 0,
          "& .MuiTab-root": {
            minHeight: 36,
            minWidth: 0,
            px: 2,
            py: 0.5,
            fontSize: "0.8rem",
            fontWeight: 600,
            textTransform: "none",
            color: "text.secondary",
            gap: 0.75,
            "&.Mui-selected": { color: "#7C5CFF" },
          },
          "& .MuiTabs-indicator": { bgcolor: "#7C5CFF", height: 2 },
        }}
      >
        <Tab
          icon={<TerminalRoundedIcon sx={{ fontSize: 16 }} />}
          iconPosition="start"
          label="Terminal"
        />
        <Tab
          icon={<TimelineRoundedIcon sx={{ fontSize: 16 }} />}
          iconPosition="start"
          label="Activity"
        />
      </Tabs>

      {/* Terminal panel */}
      <Box
        sx={{
          flex: 1,
          overflow: "hidden",
          display: activeTab === 0 ? "flex" : "none",
          alignItems: "stretch",
          bgcolor: "#1A1A1A",
          "& .xterm": { height: "100%", p: 1 },
          "& .xterm-viewport": {
            "&::-webkit-scrollbar": { width: 6 },
            "&::-webkit-scrollbar-thumb": { bgcolor: "#3A3A3A", borderRadius: 3 },
          },
        }}
      >
        <Box ref={setTermNode} sx={{ flex: 1, display: "flex" }} />
      </Box>

      {/* Activity panel */}
      {activeTab === 1 && (
        <Box sx={{ flex: 1, overflow: "hidden" }}>
          <AgentActivityTab session={session} logs={logs} onAddLog={handleAddLog} />
        </Box>
      )}
    </Dialog>
  );
}
