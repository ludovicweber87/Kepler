"use client";

import { useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Avatar from "@mui/material/Avatar";
import Skeleton from "@mui/material/Skeleton";
import Alert from "@mui/material/Alert";
import { alpha } from "@mui/material/styles";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import CircleRoundedIcon from "@mui/icons-material/CircleRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import { useIssue } from "@/hooks/useGitHub";
import { GitHubComment } from "@/types";
import TerminalModal from "@/components/terminal/TerminalModal";
import IssueTimelineModal from "@/components/dashboard/IssueTimelineModal";

const markdownSx = {
  "& h1": { fontSize: "1.4rem", fontWeight: 700, mt: 3, mb: 1.5, color: "text.primary" },
  "& h2": { fontSize: "1.2rem", fontWeight: 600, mt: 2.5, mb: 1, color: "text.primary" },
  "& h3": { fontSize: "1.05rem", fontWeight: 600, mt: 2, mb: 1, color: "text.primary" },
  "& p": { mb: 1.5, lineHeight: 1.7, color: "text.secondary" },
  "& ul, & ol": { pl: 3, mb: 1.5, color: "text.secondary" },
  "& li": { mb: 0.5 },
  "& code": {
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    fontSize: "0.85em",
    bgcolor: (t: { palette: { divider: string } }) => alpha(t.palette.divider, 0.3),
    px: 0.75,
    py: 0.25,
    borderRadius: 1,
  },
  "& pre": {
    bgcolor: "#1A1A1A",
    borderRadius: 1,
    p: 2,
    overflow: "auto",
    mb: 2,
    "& code": { bgcolor: "transparent", p: 0 },
  },
  "& blockquote": {
    borderLeft: "3px solid",
    borderColor: "primary.main",
    pl: 2,
    ml: 0,
    my: 1.5,
    "& p": { color: "text.secondary" },
  },
  "& a": { color: "primary.light", textDecoration: "none", "&:hover": { textDecoration: "underline" } },
  "& img": { maxWidth: "100%", borderRadius: 1, my: 1 },
  "& table": {
    width: "100%",
    borderCollapse: "collapse",
    mb: 2,
    "& th, & td": {
      border: (t: { palette: { divider: string } }) => `1px solid ${t.palette.divider}`,
      px: 1.5,
      py: 1,
      textAlign: "left",
    },
    "& th": { bgcolor: (t: { palette: { divider: string } }) => alpha(t.palette.divider, 0.2), fontWeight: 600 },
  },
  "& hr": { border: "none", borderTop: (t: { palette: { divider: string } }) => `1px solid ${t.palette.divider}`, my: 2 },
  "& input[type='checkbox']": { mr: 1 },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Comment({ comment, index }: { comment: GitHubComment; index: number }) {
  return (
    <Box sx={{ display: "flex", gap: 2, animation: `fadeInUp 0.35s ease-out ${index * 0.05}s both` }}>
      <Avatar
        src={comment.user.avatar_url}
        alt={comment.user.login}
        sx={{ width: 32, height: 32, mt: 0.5 }}
      />
      <Card sx={{ flex: 1 }}>
        <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {comment.user.login}
            </Typography>
            <Typography variant="body2" sx={{ fontSize: "0.75rem" }}>
              {formatDate(comment.created_at)}
            </Typography>
          </Box>
          <Box sx={markdownSx}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {comment.body}
            </ReactMarkdown>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

export default function IssueDetail({
  owner,
  repo,
  number,
}: {
  owner: string;
  repo: string;
  number: string;
}) {
  const { data, error, isLoading } = useIssue(owner, repo, number);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);

  if (isLoading) {
    return (
      <Box sx={{ maxWidth: 860, mx: "auto" }}>
        <Skeleton variant="rounded" width={180} height={36} sx={{ mb: 3, borderRadius: 1 }} />
        <Skeleton variant="rounded" height={400} sx={{ borderRadius: 1 }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ maxWidth: 860, mx: "auto" }}>
        <Link href="/issues" style={{ textDecoration: "none" }}>
          <Button startIcon={<ArrowBackRoundedIcon />} sx={{ mb: 3, color: "text.secondary" }}>
            Back to issues
          </Button>
        </Link>
        <Alert severity="error" sx={{ borderRadius: 1 }}>
          Failed to load issue: {error.message}
        </Alert>
      </Box>
    );
  }

  if (!data) return null;

  const { issue, comments } = data;
  const isOpen = issue.state === "open";
  const stateColor = isOpen ? "#22C55E" : "#808080";
  const stateLabel = isOpen ? "Open" : "Closed";
  return (
    <Box sx={{ maxWidth: 860, mx: "auto" }}>
      <Link href="/" style={{ textDecoration: "none" }}>
        <Button startIcon={<ArrowBackRoundedIcon />} sx={{ mb: 3, color: "text.secondary" }}>
          Back to dashboard
        </Button>
      </Link>

      <Card sx={{ mb: 3, animation: "fadeInUp 0.4s ease-out both" }}>
        <CardContent sx={{ p: 4, "&:last-child": { pb: 4 } }}>
          <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 3 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h4" sx={{ mb: 1.5, lineHeight: 1.3 }}>
                {issue.title}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                <Chip
                  icon={
                    isOpen
                      ? <CircleRoundedIcon sx={{ fontSize: "14px !important" }} />
                      : <CheckCircleRoundedIcon sx={{ fontSize: "14px !important" }} />
                  }
                  label={stateLabel}
                  sx={{
                    bgcolor: alpha(stateColor, 0.12),
                    color: stateColor,
                    fontWeight: 600,
                    "& .MuiChip-icon": { color: stateColor },
                  }}
                />
                {issue.labels.map((label) => (
                  <Chip
                    key={label.name}
                    label={label.name}
                    sx={{
                      bgcolor: alpha(`#${label.color}`, 0.15),
                      color: `#${label.color}`,
                    }}
                  />
                ))}
              </Box>
            </Box>
            <Box sx={{ display: "flex", gap: 1, flexShrink: 0, ml: 2 }}>
              <Button
                variant="contained"
                size="small"
                startIcon={<SmartToyRoundedIcon />}
                onClick={() => setTerminalOpen(true)}
              >
                Start Agent
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<HistoryRoundedIcon />}
                onClick={() => setTimelineOpen(true)}
              >
                History
              </Button>
              <Button
                variant="outlined"
                size="small"
                endIcon={<OpenInNewRoundedIcon />}
                href={issue.html_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </Button>
            </Box>
          </Box>

          <Divider sx={{ my: 3 }} />

          <Box sx={{ display: "flex", gap: 4, mb: 3, flexWrap: "wrap" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FolderOpenRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
              <Typography variant="body2">
                {owner}/{repo}{" "}
                <Typography component="span" sx={{ color: "text.secondary" }}>
                  #{number}
                </Typography>
              </Typography>
            </Box>
            {issue.assignee && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <PersonRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                <Avatar
                  src={issue.assignee.avatar_url}
                  alt={issue.assignee.login}
                  sx={{ width: 22, height: 22 }}
                />
                <Typography variant="body2">{issue.assignee.login}</Typography>
              </Box>
            )}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <AccessTimeRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
              <Typography variant="body2">{formatDate(issue.updated_at)}</Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
              <Typography variant="body2">
                {comments.length} comment{comments.length !== 1 ? "s" : ""}
              </Typography>
            </Box>
          </Box>

          {issue.body ? (
            <Box sx={markdownSx}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {issue.body}
              </ReactMarkdown>
            </Box>
          ) : (
            <Typography variant="body2" sx={{ fontStyle: "italic", color: "text.secondary" }}>
              No description provided.
            </Typography>
          )}
        </CardContent>
      </Card>

      {comments.length > 0 && (
        <Box>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Comments ({comments.length})
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {comments.map((comment, index) => (
              <Comment key={comment.id} comment={comment} index={index} />
            ))}
          </Box>
        </Box>
      )}

      <TerminalModal
        open={terminalOpen}
        onClose={() => setTerminalOpen(false)}
        owner={owner}
        repo={repo}
        issueNumber={parseInt(number, 10)}
        issueTitle={issue.title}
      />

      <IssueTimelineModal
        open={timelineOpen}
        onClose={() => setTimelineOpen(false)}
        owner={owner}
        repo={repo}
        number={number}
        issueTitle={issue.title}
      />
    </Box>
  );
}
