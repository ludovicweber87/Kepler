"use client";

import { useState, useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import Avatar from "@mui/material/Avatar";
import { alpha } from "@mui/material/styles";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import MergeTypeRoundedIcon from "@mui/icons-material/MergeTypeRounded";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import DraggableTabs from "@/components/shared/DraggableTabs";
import { useAgentViews } from "@/hooks/useAgentViews";
import { usePullRequests } from "@/hooks/usePullRequests";
import type { GitHubPullRequest } from "@/types";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}j`;
}

function PRCard({ pr }: { pr: GitHubPullRequest }) {
  const totalChanges = pr.additions + pr.deletions;

  return (
    <Box
      component="a"
      href={pr.html_url}
      target="_blank"
      rel="noopener noreferrer"
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: 2,
        px: 2.5,
        py: 2,
        borderRadius: 1,
        bgcolor: "background.paper",
        border: 1,
        borderColor: "divider",
        textDecoration: "none",
        color: "inherit",
        transition: "transform 0.1s, box-shadow 0.15s",
        "&:hover": {
          transform: "translateX(4px)",
          boxShadow: `0 4px 16px ${alpha("#4CAF50", 0.1)}`,
          "& .open-icon": { opacity: 1 },
        },
      }}
    >
      {/* Avatar */}
      <Avatar
        src={pr.user.avatar_url}
        alt={pr.user.login}
        sx={{ width: 32, height: 32, mt: 0.25 }}
      />

      {/* Content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
            }}
          >
            {pr.title}
          </Typography>
          {pr.draft && (
            <Chip
              label="Draft"
              size="small"
              sx={{
                height: 20,
                fontSize: "0.65rem",
                bgcolor: alpha("#9E9E9E", 0.15),
                color: "text.disabled",
              }}
            />
          )}
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            #{pr.number} · {pr.head.ref}
          </Typography>

          {pr.labels.length > 0 &&
            pr.labels.slice(0, 3).map((label) => (
              <Chip
                key={label.name}
                label={label.name}
                size="small"
                sx={{
                  height: 18,
                  fontSize: "0.6rem",
                  bgcolor: `#${label.color}22`,
                  color: `#${label.color}`,
                  border: 1,
                  borderColor: `#${label.color}44`,
                }}
              />
            ))}
        </Box>

        {/* Stats row */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 1 }}>
          {totalChanges > 0 && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <InsertDriveFileOutlinedIcon sx={{ fontSize: 13, color: "text.disabled" }} />
              <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.7rem" }}>
                {pr.changed_files} file{pr.changed_files > 1 ? "s" : ""}
              </Typography>
              <Typography variant="caption" sx={{ color: "#4CAF50", fontSize: "0.7rem", ml: 0.5 }}>
                +{pr.additions}
              </Typography>
              <Typography variant="caption" sx={{ color: "#F44336", fontSize: "0.7rem" }}>
                -{pr.deletions}
              </Typography>
            </Box>
          )}
          {(pr.comments + pr.review_comments) > 0 && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 13, color: "text.disabled" }} />
              <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.7rem" }}>
                {pr.comments + pr.review_comments}
              </Typography>
            </Box>
          )}
          {pr.requested_reviewers.length > 0 && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
              {pr.requested_reviewers.slice(0, 3).map((r) => (
                <Tooltip key={r.login} title={r.login}>
                  <Avatar src={r.avatar_url} sx={{ width: 18, height: 18 }} />
                </Tooltip>
              ))}
            </Box>
          )}
        </Box>
      </Box>

      {/* Right side */}
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5, flexShrink: 0 }}>
        <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.7rem" }}>
          {timeAgo(pr.updated_at)}
        </Typography>
        <OpenInNewRoundedIcon
          className="open-icon"
          sx={{ fontSize: 14, color: "text.disabled", opacity: 0, transition: "opacity 0.15s" }}
        />
      </Box>
    </Box>
  );
}

export default function PullRequestsList() {
  const {
    views,
    activeIndex,
    activeView,
    setActiveIndex,
    addView,
    reorderViews,
  } = useAgentViews();

  const allRepos = useMemo(() => views.map((v) => v.repoFullName), [views]);
  const { data: allPrs, isLoading } = usePullRequests(allRepos);

  const [tabIndex, setTabIndex] = useState(0);
  const showAll = tabIndex === 0;

  const filteredPrs = useMemo(() => {
    if (!allPrs) return [];
    if (showAll) return allPrs;
    const repo = views[tabIndex - 1]?.repoFullName;
    return repo ? allPrs.filter((pr) => pr.repo_full_name === repo) : [];
  }, [allPrs, showAll, tabIndex, views]);

  // No views
  if (views.length === 0) {
    return (
      <Box sx={{ p: 4, maxWidth: 900, mx: "auto" }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            mb: 4,
            background: "linear-gradient(135deg, #4CAF50 0%, #7C5CFF 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Pull Requests
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
            Add a repository in Settings first.
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddRoundedIcon />}
            onClick={() => addView()}
            sx={{
              borderColor: "#4CAF50",
              color: "#4CAF50",
              textTransform: "none",
              "&:hover": {
                borderColor: "#4CAF50",
                bgcolor: alpha("#4CAF50", 0.08),
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
    <Box sx={{ p: 4, maxWidth: 900, mx: "auto" }}>
      {/* Header */}
      <Typography
        variant="h4"
        sx={{
          fontWeight: 700,
          mb: 3,
          background: "linear-gradient(135deg, #4CAF50 0%, #7C5CFF 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        Pull Requests
      </Typography>

      {/* Tabs: All + per repo */}
      <DraggableTabs
        tabs={["All", ...views.map((v) => v.label)]}
        activeTab={tabIndex}
        onTabChange={setTabIndex}
        onReorder={(newOrder) => {
          // "All" stays, reorder only the view tabs
          const viewLabels = newOrder.filter((t) => t !== "All");
          reorderViews(viewLabels);
        }}
        color="#4CAF50"
        trailing={
          <Tooltip title="Add project">
            <IconButton
              size="small"
              onClick={() => addView()}
              sx={{ color: "text.disabled", "&:hover": { color: "#4CAF50" } }}
            >
              <AddRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        }
      />

      {/* Loading */}
      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} sx={{ color: "#4CAF50" }} />
        </Box>
      )}

      {/* Empty state */}
      {!isLoading && filteredPrs.length === 0 && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            py: 8,
            gap: 1.5,
          }}
        >
          <MergeTypeRoundedIcon sx={{ fontSize: 48, color: "text.disabled" }} />
          <Typography variant="body1" color="text.secondary">
            No open pull requests
          </Typography>
        </Box>
      )}

      {/* PR list */}
      {!isLoading && filteredPrs.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {filteredPrs.map((pr) => (
            <PRCard key={pr.id} pr={pr} />
          ))}
        </Box>
      )}
    </Box>
  );
}
