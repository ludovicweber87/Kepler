"use client";

import { useState, useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import { alpha } from "@mui/material/styles";
import Link from "next/link";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import AssignmentRoundedIcon from "@mui/icons-material/AssignmentRounded";
import BugReportRoundedIcon from "@mui/icons-material/BugReportRounded";
import DoneAllRoundedIcon from "@mui/icons-material/DoneAllRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import ChecklistRoundedIcon from "@mui/icons-material/ChecklistRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { useDashboard } from "@/hooks/useGitHub";
import { usePendingTodoCount } from "@/hooks/usePendingTodoCount";
import { useWeeklyActivity } from "@/hooks/useWeeklyActivity";
import { useTodos } from "@/hooks/useTodos";
import DraggableTabs from "@/components/shared/DraggableTabs";
import { useAgentViews, type AgentView } from "@/hooks/useAgentViews";

function StatCard({
  label,
  value,
  icon,
  color,
  subtitle,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}) {
  return (
    <Box
      sx={{
        flex: "1 1 0",
        minWidth: 160,
        bgcolor: "background.paper",
        borderRadius: 1,
        border: 1,
        borderColor: "divider",
        p: 2.5,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        transition: "transform 0.15s, box-shadow 0.15s",
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: `0 8px 24px ${alpha(color, 0.15)}`,
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 1,
            bgcolor: alpha(color, 0.12),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color,
          }}
        >
          {icon}
        </Box>
        <Typography variant="h4" sx={{ fontWeight: 700, color }}>
          {value}
        </Typography>
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 600, color: "text.primary" }}>
        {label}
      </Typography>
      {subtitle && (
        <Typography variant="caption" sx={{ color: "text.disabled", mt: -0.5 }}>
          {subtitle}
        </Typography>
      )}
    </Box>
  );
}

function TodoCardContent({ repoFullName }: { repoFullName: string }) {
  const { todos, isLoading } = useTodos(repoFullName);
  const pending = useMemo(() => todos.filter((t) => !t.done).slice(0, 5), [todos]);
  const totalPending = useMemo(() => todos.filter((t) => !t.done).length, [todos]);

  if (isLoading) {
    return (
      <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <CircularProgress size={20} sx={{ color: "#FF9800" }} />
      </Box>
    );
  }

  if (pending.length === 0) {
    return (
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 1,
        }}
      >
        <CheckCircleOutlineRoundedIcon sx={{ fontSize: 40, color: "#22C55E" }} />
        <Typography variant="body2" sx={{ color: "text.disabled" }}>
          Rien en attente
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      {pending.map((todo) => (
        <Box
          key={todo.id}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: 1.5,
            py: 1,
            borderRadius: 1,
            transition: "background-color 0.15s",
            "&:hover": { bgcolor: alpha("#FF9800", 0.06) },
          }}
        >
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: "#FF9800",
              flexShrink: 0,
            }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {todo.title}
            </Typography>
            {todo.description && (
              <Typography
                variant="caption"
                sx={{
                  color: "text.disabled",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  display: "block",
                }}
              >
                {todo.description}
              </Typography>
            )}
          </Box>
          <Typography variant="caption" sx={{ color: "text.disabled", whiteSpace: "nowrap", fontSize: "0.65rem" }}>
            {new Date(todo.created_at).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "short",
            })}
          </Typography>
        </Box>
      ))}
      {totalPending > 5 && (
        <Typography variant="caption" sx={{ color: "text.disabled", px: 1.5, mt: 0.5 }}>
          +{totalPending - 5} autre{totalPending - 5 > 1 ? "s" : ""}
        </Typography>
      )}
    </Box>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon aprem";
  return "Bonsoir";
}

export default function Dashboard() {
  const [ghEnabled, setGhEnabled] = useState(false);
  const { data: dashboardData, isLoading: dashLoading, refetch: refetchGh } = useDashboard(
    undefined,
    { enabled: ghEnabled }
  );
  const pendingCount = usePendingTodoCount();
  const { data: weeklyData, isLoading: weekLoading } = useWeeklyActivity();
  const { views, reorderViews } = useAgentViews();
  const [todoTabIndex, setTodoTabIndex] = useState(0);
  const activeTodoView = views[todoTabIndex] ?? views[0];

  const ghLoaded = !!dashboardData;

  // Compute stats from GitHub data
  const stats = useMemo(() => {
    if (!dashboardData) return { open: 0, inProgress: 0, closedRecently: 0, assigned: 0 };

    const issues = dashboardData.issues;
    const open = issues.filter((i) => i.state === "open").length;
    const inProgress = issues.filter((i) => {
      const col = i.project_columns?.[0]?.column;
      return col && col.toLowerCase().includes("progress");
    }).length;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const closedRecently = issues.filter(
      (i) => i.state === "closed" && i.closed_at && new Date(i.closed_at) > sevenDaysAgo
    ).length;
    const assigned = issues.filter(
      (i) =>
        i.state === "open" &&
        i.assignees?.some((a) => a.login === dashboardData.user)
    ).length;

    return { open, inProgress, closedRecently, assigned };
  }, [dashboardData]);

  const todayStr = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const handleLoadGitHub = () => {
    setGhEnabled(true);
    refetchGh();
  };

  return (
    <Box sx={{ p: 4, maxWidth: 1100, mx: "auto" }}>
      {/* Welcome */}
      <Box sx={{ mb: 4 }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            background: "linear-gradient(135deg, #7C5CFF 0%, #00E5FF 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {getGreeting()}, Ludovic
        </Typography>
        <Typography variant="body2" sx={{ color: "text.disabled", mt: 0.5, textTransform: "capitalize" }}>
          {todayStr}
        </Typography>
        {pendingCount > 0 && (
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
            Tu as <strong style={{ color: "#FF9800" }}>{pendingCount} todo{pendingCount > 1 ? "s" : ""}</strong> en
            attente{ghLoaded && stats.inProgress > 0 && (
              <>
                {" "}et <strong style={{ color: "#7C5CFF" }}>{stats.inProgress} issue{stats.inProgress > 1 ? "s" : ""}</strong> en cours
              </>
            )}.
          </Typography>
        )}
      </Box>

      {/* Stats */}
      <Box sx={{ display: "flex", gap: 2, mb: 4, flexWrap: "wrap" }}>
        <StatCard
          label="Todos en attente"
          value={pendingCount}
          icon={<AssignmentRoundedIcon />}
          color="#FF9800"
          subtitle="Tous les repos"
        />
        {ghLoaded ? (
          <>
            <StatCard
              label="In Progress"
              value={stats.inProgress}
              icon={<TrendingUpRoundedIcon />}
              color="#7C5CFF"
              subtitle="Issues GitHub"
            />
            <StatCard
              label="Assign. ouvertes"
              value={stats.assigned}
              icon={<BugReportRoundedIcon />}
              color="#00E5FF"
              subtitle="Qui te sont assignees"
            />
            <StatCard
              label="Fermees (7j)"
              value={stats.closedRecently}
              icon={<DoneAllRoundedIcon />}
              color="#22C55E"
              subtitle="Cette semaine"
            />
          </>
        ) : (
          <Box
            onClick={handleLoadGitHub}
            sx={{
              flex: "3 1 0",
              minWidth: 320,
              bgcolor: "background.paper",
              borderRadius: 1,
              border: 1,
              borderColor: "divider",
              p: 2.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 1.5,
              cursor: "pointer",
              transition: "all 0.15s",
              "&:hover": {
                borderColor: alpha("#7C5CFF", 0.4),
                bgcolor: alpha("#7C5CFF", 0.04),
              },
            }}
          >
            {dashLoading ? (
              <CircularProgress size={20} sx={{ color: "#7C5CFF" }} />
            ) : (
              <SyncRoundedIcon sx={{ color: "#7C5CFF" }} />
            )}
            <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 500 }}>
              {dashLoading ? "Chargement des issues GitHub..." : "Charger les stats GitHub"}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Two-column layout: Todos + Chart */}
      <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        {/* Pending todos with tabs */}
        <Box
          sx={{
            flex: "1 1 320px",
            bgcolor: "background.paper",
            borderRadius: 1,
            border: 1,
            borderColor: "divider",
            p: 3,
            minHeight: 280,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <ChecklistRoundedIcon sx={{ color: "#FF9800", fontSize: "1.2rem" }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                A faire
              </Typography>
            </Box>
            <Link href="/todos" style={{ textDecoration: "none" }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  color: "#FF9800",
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                Voir tout <ArrowForwardRoundedIcon sx={{ fontSize: 14 }} />
              </Box>
            </Link>
          </Box>

          {/* Repo tabs */}
          {views.length > 1 && (
            <DraggableTabs
              tabs={views.map((v) => v.label)}
              activeTab={todoTabIndex}
              onTabChange={setTodoTabIndex}
              onReorder={reorderViews}
              color="#FF9800"
            />
          )}

          {/* Todo list for active tab */}
          {views.length === 0 ? (
            <Box
              sx={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Typography variant="body2" sx={{ color: "text.disabled" }}>
                Aucun projet configure
              </Typography>
            </Box>
          ) : (
            <TodoCardContent repoFullName={activeTodoView.repoFullName} />
          )}
        </Box>

        {/* Weekly activity chart */}
        <Box
          sx={{
            flex: "1 1 400px",
            bgcolor: "background.paper",
            borderRadius: 1,
            border: 1,
            borderColor: "divider",
            p: 3,
            minHeight: 280,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <TrendingUpRoundedIcon sx={{ color: "#7C5CFF", fontSize: "1.2rem" }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Activite de la semaine
            </Typography>
          </Box>

          {weekLoading ? (
            <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CircularProgress size={24} sx={{ color: "#7C5CFF" }} />
            </Box>
          ) : (
            <Box sx={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "#888", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "#888", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "#2A2A2A",
                      border: "1px solid #3A3A3A",
                      borderRadius: 1,
                      fontSize: 13,
                    }}
                    labelStyle={{ color: "#fff", fontWeight: 600 }}
                  />
                  <Bar
                    dataKey="added"
                    name="Ajoutees"
                    fill="#FF9800"
                    radius={[4, 4, 0, 0]}
                    barSize={16}
                  />
                  <Bar
                    dataKey="completed"
                    name="Completees"
                    fill="#22C55E"
                    radius={[4, 4, 0, 0]}
                    barSize={16}
                  />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          )}
        </Box>
      </Box>

      {/* Issues In Progress */}
      {ghLoaded && stats.inProgress > 0 && dashboardData && (
        <Box
          sx={{
            mt: 3,
            bgcolor: "background.paper",
            borderRadius: 1,
            border: 1,
            borderColor: "divider",
            p: 3,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <BugReportRoundedIcon sx={{ color: "#7C5CFF", fontSize: "1.2rem" }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Issues en cours
              </Typography>
            </Box>
            <Link href="/issues" style={{ textDecoration: "none" }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  color: "#7C5CFF",
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                Voir tout <ArrowForwardRoundedIcon sx={{ fontSize: 14 }} />
              </Box>
            </Link>
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {dashboardData.issues
              .filter((i) => {
                const col = i.project_columns?.[0]?.column;
                return i.state === "open" && col && col.toLowerCase().includes("progress");
              })
              .slice(0, 6)
              .map((issue) => (
                <Box
                  key={issue.id}
                  component="a"
                  href={issue.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    px: 1.5,
                    py: 1,
                    borderRadius: 1,
                    textDecoration: "none",
                    color: "inherit",
                    transition: "background-color 0.15s",
                    "&:hover": { bgcolor: alpha("#7C5CFF", 0.06) },
                  }}
                >
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      bgcolor: "#7C5CFF",
                      flexShrink: 0,
                    }}
                  />
                  <Typography
                    variant="body2"
                    sx={{ flex: 1, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {issue.title}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.disabled", whiteSpace: "nowrap" }}>
                    {issue.repo_full_name?.split("/").pop()} #{issue.number}
                  </Typography>
                </Box>
              ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
