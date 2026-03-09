"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import TerminalRoundedIcon from "@mui/icons-material/TerminalRounded";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useRepoPaths } from "@/hooks/useRepoPaths";

interface TerminalModalProps {
  open: boolean;
  onClose: () => void;
  owner: string;
  repo: string;
  issueNumber: number;
  issueTitle: string;
}

export default function TerminalModal({
  open,
  onClose,
  owner,
  repo,
  issueNumber,
  issueTitle,
}: TerminalModalProps) {
  const repoFullName = `${owner}/${repo}`;
  const sessionId = `devora-${owner}-${repo}-${issueNumber}`;
  const { getLocalPath, savePath } = useRepoPaths();

  const [cwd, setCwd] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const termRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Resolve CWD when modal opens
  const resolveCwd = useCallback(async () => {
    const saved = getLocalPath(repoFullName);
    if (saved) {
      setCwd(saved);
      return;
    }

    setPicking(true);
    try {
      const res = await fetch("/api/filesystem/pick-directory");
      const { path } = await res.json();
      if (path) {
        savePath(repoFullName, path);
        setCwd(path);
      } else {
        onClose();
      }
    } catch {
      onClose();
    } finally {
      setPicking(false);
    }
  }, [getLocalPath, savePath, repoFullName, onClose]);

  useEffect(() => {
    if (open && !cwd) {
      resolveCwd();
    }
  }, [open, cwd, resolveCwd]);

  // Reset cwd when modal closes
  useEffect(() => {
    if (!open) {
      setCwd(null);
    }
  }, [open]);

  // Initialize xterm + WebSocket when cwd is ready
  useEffect(() => {
    if (!open || !cwd || !termRef.current) return;

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
    terminal.open(termRef.current);

    // Small delay to let the DOM settle before fitting
    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Connect WebSocket
    const ws = new WebSocket("ws://localhost:4001");
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "init",
          sessionId,
          cwd,
          cols: terminal.cols,
          rows: terminal.rows,
        })
      );
    };

    ws.onmessage = (event) => {
      terminal.write(typeof event.data === "string" ? event.data : "");
    };

    ws.onclose = () => {
      terminal.write("\r\n\x1b[90m[Session disconnected]\x1b[0m\r\n");
    };

    // Forward terminal input to WebSocket
    terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    // Handle resize
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
    observer.observe(termRef.current);

    return () => {
      observer.disconnect();
      ws.close();
      terminal.dispose();
      terminalRef.current = null;
      wsRef.current = null;
      fitAddonRef.current = null;
    };
  }, [open, cwd, sessionId]);

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
          pb: 1,
          flexShrink: 0,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
          <TerminalRoundedIcon sx={{ color: "#00E5FF" }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
            Claude — #{issueNumber}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 400,
              color: "text.secondary",
            }}
          >
            {issueTitle}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
          <Chip
            icon={<FolderOpenRoundedIcon sx={{ fontSize: "14px !important" }} />}
            label={repoFullName}
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

      <Box
        sx={{
          flex: 1,
          overflow: "hidden",
          display: "flex",
          alignItems: "stretch",
          bgcolor: "#1A1A1A",
          "& .xterm": { height: "100%", p: 1 },
          "& .xterm-viewport": {
            "&::-webkit-scrollbar": { width: 6 },
            "&::-webkit-scrollbar-thumb": { bgcolor: "#3A3A3A", borderRadius: 3 },
          },
        }}
      >
        {picking && (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
            }}
          >
            <CircularProgress size={28} sx={{ color: "#00E5FF" }} />
            <Typography variant="body2" color="text.secondary">
              Select repository directory...
            </Typography>
          </Box>
        )}

        {!cwd && !picking && (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CircularProgress size={24} sx={{ color: "#00E5FF" }} />
          </Box>
        )}

        <Box
          ref={termRef}
          sx={{
            flex: 1,
            display: cwd ? "flex" : "none",
          }}
        />
      </Box>
    </Dialog>
  );
}
