"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import CircularProgress from "@mui/material/CircularProgress";
import { alpha } from "@mui/material/styles";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import AutoFixHighRoundedIcon from "@mui/icons-material/AutoFixHighRounded";
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SkillEditorDialog from "./SkillEditorDialog";
import AgentTerminalModal from "@/components/agents/AgentTerminalModal";
import { useAgentViews } from "@/hooks/useAgentViews";
import { useSkillFiles, type SkillFile } from "@/hooks/useSkillFiles";

export default function SkillsList() {
  const {
    views,
    activeIndex,
    activeView,
    setActiveIndex,
    addView,
  } = useAgentViews();

  const { skills, isLoading, saveSkill, deleteSkill } = useSkillFiles(
    activeView?.path ?? null
  );

  const [terminalOpen, setTerminalOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<SkillFile | undefined>(undefined);

  const handleLaunch = () => {
    setTerminalOpen(true);
  };

  const handleEdit = (skill?: SkillFile) => {
    setEditingSkill(skill);
    setEditorOpen(true);
  };

  const handleSaveSkill = (filename: string, content: string) => {
    saveSkill(filename, content);
    setEditorOpen(false);
    setEditingSkill(undefined);
  };

  // No views — empty state
  if (views.length === 0) {
    return (
      <Box sx={{ p: 4, maxWidth: 1000, mx: "auto" }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            mb: 4,
            background: "linear-gradient(135deg, #00E5FF 0%, #7C5CFF 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Skills
        </Typography>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            py: 12,
            gap: 2,
          }}
        >
          <FolderOpenRoundedIcon sx={{ fontSize: 64, color: "text.disabled" }} />
          <Typography variant="h6" color="text.secondary">
            No project selected
          </Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
            Add a repository in Settings to manage its skills.
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddRoundedIcon />}
            onClick={() => addView()}
            sx={{
              borderColor: "#00E5FF",
              color: "#00E5FF",
              textTransform: "none",
              "&:hover": {
                borderColor: "#00E5FF",
                bgcolor: alpha("#00E5FF", 0.08),
              },
            }}
          >
            Add Project
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 4, maxWidth: 1000, mx: "auto" }}>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 3,
        }}
      >
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            background: "linear-gradient(135deg, #00E5FF 0%, #7C5CFF 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Skills
        </Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddRoundedIcon />}
            component="a"
            href="https://skills.sh/"
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              borderColor: alpha("#00E5FF", 0.4),
              color: "#00E5FF",
              textTransform: "none",
              fontWeight: 600,
              borderRadius: 1,
              "&:hover": {
                borderColor: "#00E5FF",
                bgcolor: alpha("#00E5FF", 0.08),
              },
            }}
          >
            Find Skills
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddRoundedIcon />}
            onClick={() => handleLaunch()}
            sx={{
              bgcolor: "#00E5FF",
              color: "#1A1A1A",
              "&:hover": { bgcolor: alpha("#00E5FF", 0.85) },
              borderRadius: 1,
              textTransform: "none",
              fontWeight: 600,
            }}
          >
            New Skill
          </Button>
        </Box>
      </Box>

      {/* Tabs */}
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
        {views.map((view, idx) => {
          const isActive = idx === activeIndex;
          return (
            <Box
              key={view.repoFullName}
              onClick={() => setActiveIndex(idx)}
              sx={{
                px: 2,
                py: 1,
                borderRadius: 1,
                cursor: "pointer",
                userSelect: "none",
                whiteSpace: "nowrap",
                fontSize: "0.85rem",
                fontWeight: 500,
                transition: "background-color 0.15s",
                bgcolor: isActive ? alpha("#00E5FF", 0.18) : "transparent",
                color: isActive ? "#00E5FF" : "text.secondary",
                border: 1,
                borderColor: isActive ? alpha("#00E5FF", 0.25) : "transparent",
                "&:hover": {
                  bgcolor: alpha("#00E5FF", isActive ? 0.22 : 0.08),
                },
              }}
            >
              {view.label}
            </Box>
          );
        })}
        <Tooltip title="Add project">
          <IconButton
            size="small"
            onClick={() => addView()}
            sx={{ color: "text.disabled", "&:hover": { color: "#00E5FF" } }}
          >
            <AddRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Loading */}
      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress size={28} sx={{ color: "#00E5FF" }} />
        </Box>
      )}

      {/* Empty state */}
      {!isLoading && skills.length === 0 && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            py: 12,
            gap: 2,
          }}
        >
          <AutoFixHighRoundedIcon sx={{ fontSize: 64, color: "text.disabled" }} />
          <Typography variant="h6" color="text.secondary">
            No skills yet
          </Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mb: 2, textAlign: "center" }}>
            Create a <code>.md</code> file in{" "}
            <code>{activeView?.path}/.claude/skills/</code>
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddRoundedIcon />}
            onClick={() => handleLaunch()}
            sx={{
              borderColor: "#00E5FF",
              color: "#00E5FF",
              textTransform: "none",
              "&:hover": {
                borderColor: "#00E5FF",
                bgcolor: alpha("#00E5FF", 0.08),
              },
            }}
          >
            Create Skill
          </Button>
        </Box>
      )}

      {/* Skill cards */}
      {!isLoading && skills.length > 0 && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2.5 }}>
          {skills.map((skill) => (
            <Box
              key={skill.filename}
              onClick={() => handleEdit(skill)}
              sx={{
                width: {
                  xs: "100%",
                  sm: "calc(50% - 10px)",
                  md: "calc(33.333% - 14px)",
                },
                bgcolor: "background.paper",
                borderRadius: 1,
                border: 1,
                borderColor: "divider",
                overflow: "hidden",
                cursor: "pointer",
                transition: "transform 0.15s, box-shadow 0.15s",
                "&:hover": {
                  transform: "translateY(-2px)",
                  boxShadow: `0 8px 24px ${alpha("#00E5FF", 0.15)}`,
                },
              }}
            >
              <Box sx={{ height: 4, bgcolor: "#00E5FF" }} />
              <Box sx={{ p: 2.5 }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    mb: 1,
                  }}
                >
                  {skill.isFolder ? (
                    <FolderRoundedIcon sx={{ fontSize: "1.25rem", color: "#00E5FF" }} />
                  ) : (
                    <DescriptionRoundedIcon sx={{ fontSize: "1.25rem", color: "#00E5FF" }} />
                  )}
                  <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 700, flex: 1, lineHeight: 1.3 }}
                  >
                    {skill.name}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    mb: 2,
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    color: "text.secondary",
                    fontSize: "0.8rem",
                    lineHeight: 1.5,
                    "& p": { m: 0 },
                    "& p + p": { mt: 0.5 },
                    "& code": {
                      fontFamily: '"JetBrains Mono", monospace',
                      fontSize: "0.75em",
                      bgcolor: "rgba(255,255,255,0.06)",
                      px: 0.5,
                      borderRadius: 1,
                    },
                    "& ul, & ol": { pl: 2, my: 0 },
                    "& h1, & h2, & h3, & h4, & h5, & h6": {
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      m: 0,
                      color: "text.primary",
                    },
                  }}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {skill.content}
                  </ReactMarkdown>
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 0.5,
                  }}
                >
                  <Tooltip title="Edit">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(skill);
                      }}
                      sx={{
                        color: "text.secondary",
                        "&:hover": { color: "#00E5FF" },
                      }}
                    >
                      <EditRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSkill(skill.filename, skill.isFolder);
                      }}
                      sx={{
                        color: "text.secondary",
                        "&:hover": { color: "#F44336" },
                      }}
                    >
                      <DeleteRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* Terminal modal */}
      <AgentTerminalModal
        open={terminalOpen}
        onClose={() => setTerminalOpen(false)}
        projectPath={activeView?.path}
      />

      {/* Editor dialog */}
      <SkillEditorDialog
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditingSkill(undefined);
        }}
        onSave={handleSaveSkill}
        skill={editingSkill}
      />
    </Box>
  );
}
