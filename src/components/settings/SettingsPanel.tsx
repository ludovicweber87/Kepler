"use client";

import { useState, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import ListSubheader from "@mui/material/ListSubheader";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import CircularProgress from "@mui/material/CircularProgress";
import Snackbar from "@mui/material/Snackbar";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import { alpha } from "@mui/material/styles";
import GitHubIcon from "@mui/icons-material/GitHub";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import type { ProjectV2View, ViewRepoMapping } from "@/types";
import { useProjectConfig } from "@/hooks/useProjectConfig";
import { useRepoPaths } from "@/hooks/useRepoPaths";

interface OrgProject {
  id: string;
  title: string;
  number: number;
}

interface OrgWithProjects {
  org: string;
  projects: OrgProject[];
}

interface ProjectViewsData {
  project: { id: string; title: string; number: number };
  views: ProjectV2View[];
  viewRepoMappings: ViewRepoMapping[];
  statusColumns: string[];
}

const accordionSx = {
  bgcolor: "background.paper",
  border: 1,
  borderColor: "divider",
  borderRadius: "4px !important",
  "&::before": { display: "none" },
  "&.Mui-expanded": { margin: "0 !important" },
};

export default function SettingsPanel() {
  const { config, saveConfig, clearConfig } = useProjectConfig();
  const { repoPaths, savePath, deletePath } = useRepoPaths();

  const [orgProjects, setOrgProjects] = useState<OrgWithProjects[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>(
    config ? `${config.org}/${config.projectNumber}` : ""
  );
  const [viewsData, setViewsData] = useState<ProjectViewsData | null>(() => {
    if (config?.views?.length) {
      return {
        project: { id: "", title: config.projectTitle, number: config.projectNumber },
        views: config.views,
        viewRepoMappings: config.viewRepoMappings,
        statusColumns: config.statusColumns,
      };
    }
    return null;
  });
  const [selectedViews, setSelectedViews] = useState<Set<string>>(
    new Set(config?.selectedViews ?? [])
  );
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingViews, setLoadingViews] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("Views saved");
  const [localPaths, setLocalPaths] = useState<Record<string, string>>({});
  const [pickingRepo, setPickingRepo] = useState<string | null>(null);

  // Sync selectedViews when config loads async
  useEffect(() => {
    if (config?.selectedViews?.length) {
      setSelectedViews(new Set(config.selectedViews));
    }
  }, [config?.selectedViews?.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore viewsData from config, or fetch if views not cached yet (retro-compat)
  useEffect(() => {
    if (viewsData || !config) return;
    if (config.views?.length) {
      setViewsData({
        project: { id: "", title: config.projectTitle, number: config.projectNumber },
        views: config.views,
        viewRepoMappings: config.viewRepoMappings,
        statusColumns: config.statusColumns,
      });
    } else {
      loadProjectViews(config.org, config.projectNumber);
    }
  }, [config]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync local paths from DB
  useEffect(() => {
    const fromDb: Record<string, string> = {};
    for (const rp of repoPaths) fromDb[rp.repo_full_name] = rp.local_path;
    setLocalPaths((prev) => {
      const next = { ...fromDb };
      for (const [k, v] of Object.entries(prev)) {
        if (v && !fromDb[k]) next[k] = v;
      }
      return next;
    });
  }, [repoPaths]);

  // Auto-discover orgs + projects on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/github/projects");
        if (!res.ok) throw new Error(`Failed to load projects: ${res.status}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        if (!cancelled) {
          setOrgProjects(data.orgProjects ?? []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load projects");
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadProjectViews = useCallback(async (org: string, projectNumber: number) => {
    setLoadingViews(true);
    setError(null);
    setViewsData(null);
    try {
      const res = await fetch(
        `/api/github/projects?org=${encodeURIComponent(org)}&projectNumber=${projectNumber}`
      );
      if (!res.ok) throw new Error(`Failed to load project views: ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setViewsData(data as ProjectViewsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project views");
    } finally {
      setLoadingViews(false);
    }
  }, []);

  const handleProjectChange = (key: string) => {
    setSelectedKey(key);
    setViewsData(null);
    setSelectedViews(new Set());
    const [org, numStr] = key.split("/");
    loadProjectViews(org, parseInt(numStr, 10));
  };

  const toggleView = (viewName: string) => {
    setSelectedViews((prev) => {
      const next = new Set(prev);
      if (next.has(viewName)) next.delete(viewName);
      else next.add(viewName);
      return next;
    });
  };

  const selectedOrg = selectedKey.split("/")[0] ?? "";

  const handleSave = () => {
    if (!viewsData || selectedViews.size === 0) return;
    const views = Array.from(selectedViews);
    saveConfig({
      org: selectedOrg,
      projectNumber: viewsData.project.number,
      projectTitle: viewsData.project.title,
      selectedViews: views,
      activeView: views[0],
      viewOrder: views,
      viewRepoMappings: viewsData.viewRepoMappings,
      statusColumns: viewsData.statusColumns ?? [],
      views: viewsData.views,
    });
    setToastMessage("Views saved");
    setToast(true);
  };

  const handleClear = () => {
    clearConfig();
    setSelectedKey("");
    setViewsData(null);
    setSelectedViews(new Set());
  };

  const pickDirectory = async (repo: string) => {
    setPickingRepo(repo);
    try {
      const res = await fetch("/api/filesystem/pick-directory");
      const { path } = await res.json();
      if (path) {
        setLocalPaths((prev) => ({ ...prev, [repo]: path }));
        savePath(repo, path);
        setToastMessage("Path saved");
        setToast(true);
      }
    } finally {
      setPickingRepo(null);
    }
  };

  const totalProjects = orgProjects.reduce((sum, o) => sum + o.projects.length, 0);

  return (
    <Box>
      <Typography
        variant="h4"
        sx={{
          fontWeight: 700,
          mb: 3,
          background: "linear-gradient(135deg, #7C5CFF 0%, #9A84FF 30%, #00D4FF 100%)",
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        Settings
      </Typography>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {/* GitHub Project Views */}
        <Accordion defaultExpanded sx={accordionSx}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <GitHubIcon sx={{ color: "text.secondary" }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                GitHub Project Views
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Select a project from your organizations to filter dashboard data by view.
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 2, borderRadius: 1 }}>
                {error}
              </Alert>
            )}

            {loadingProjects && (
              <Skeleton variant="rounded" height={40} sx={{ borderRadius: 1, mb: 2.5 }} />
            )}

            {!loadingProjects && totalProjects === 0 && !error && (
              <Alert severity="info" sx={{ mb: 2, borderRadius: 1 }}>
                No projects found in your organizations.
              </Alert>
            )}

            {!loadingProjects && totalProjects > 0 && (
              <FormControl fullWidth size="small" sx={{ mb: 2.5 }}>
                <InputLabel>Project</InputLabel>
                <Select
                  value={selectedKey}
                  label="Project"
                  onChange={(e) => handleProjectChange(e.target.value)}
                >
                  {orgProjects.map((o) => [
                    <ListSubheader key={`header-${o.org}`} sx={{ bgcolor: "background.paper" }}>
                      {o.org}
                    </ListSubheader>,
                    ...o.projects.map((p) => (
                      <MenuItem key={p.id} value={`${o.org}/${p.number}`}>
                        {p.title}
                      </MenuItem>
                    )),
                  ])}
                </Select>
              </FormControl>
            )}

            {loadingViews && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
                <CircularProgress size={20} />
                <Typography variant="body2" color="text.secondary">
                  Loading project views and items...
                </Typography>
              </Box>
            )}

            {viewsData && viewsData.views.length > 0 && (
              <Box sx={{ mb: 2.5 }}>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Views
                  </Typography>
                  <Tooltip title="Refetch views from GitHub">
                    <IconButton
                      size="small"
                      onClick={() => {
                        const [org, numStr] = selectedKey.split("/");
                        if (org && numStr) loadProjectViews(org, parseInt(numStr, 10));
                      }}
                      disabled={loadingViews || !selectedKey}
                      sx={{
                        color: "text.secondary",
                        animation: loadingViews ? "spin 1s linear infinite" : "none",
                        "@keyframes spin": { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } },
                      }}
                    >
                      <RefreshRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
                {viewsData.views.map((view) => {
                  const mapping = viewsData.viewRepoMappings.find(
                    (m) => m.viewName === view.name
                  );
                  const repoCount = mapping?.repos.length ?? 0;
                  return (
                    <Box
                      key={view.id}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        py: 0.5,
                        px: 1,
                        borderRadius: 1,
                        "&:hover": {
                          bgcolor: (t) => alpha(t.palette.primary.main, 0.04),
                        },
                      }}
                    >
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={selectedViews.has(view.name)}
                            onChange={() => toggleView(view.name)}
                            size="small"
                          />
                        }
                        label={view.name}
                        sx={{ flex: 1, mr: 0 }}
                      />
                      <Chip
                        label={`${repoCount} repo${repoCount !== 1 ? "s" : ""}`}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: "0.75rem" }}
                      />
                    </Box>
                  );
                })}
              </Box>
            )}

            {(viewsData || config) && (
              <Box sx={{ display: "flex", gap: 1.5 }}>
                <Button
                  variant="contained"
                  onClick={handleSave}
                  disabled={!viewsData || selectedViews.size === 0}
                >
                  Save
                </Button>
                <Button variant="outlined" color="secondary" onClick={handleClear}>
                  Clear
                </Button>
              </Box>
            )}
          </AccordionDetails>
        </Accordion>

        {/* Repo Local Paths */}
        <Accordion defaultExpanded sx={accordionSx}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <FolderRoundedIcon sx={{ color: "text.secondary" }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Repository Local Paths
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Local paths for your repositories. Used for git operations and agent sessions.
            </Typography>

            {repoPaths.length > 0 && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mb: 2.5 }}>
                {repoPaths.map((rp) => (
                  <TextField
                    key={rp.repo_full_name}
                    label={rp.repo_full_name}
                    size="small"
                    fullWidth
                    value={localPaths[rp.repo_full_name] ?? rp.local_path}
                    onChange={(e) =>
                      setLocalPaths((prev) => ({ ...prev, [rp.repo_full_name]: e.target.value }))
                    }
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <Tooltip title="Browse...">
                              <IconButton
                                size="small"
                                edge="end"
                                onClick={() => pickDirectory(rp.repo_full_name)}
                                disabled={pickingRepo !== null}
                              >
                                {pickingRepo === rp.repo_full_name ? (
                                  <CircularProgress size={18} />
                                ) : (
                                  <FolderOpenRoundedIcon fontSize="small" />
                                )}
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Remove">
                              <IconButton
                                size="small"
                                edge="end"
                                onClick={() => deletePath(rp.repo_full_name)}
                                sx={{ color: "text.disabled", "&:hover": { color: "#F44336" } }}
                              >
                                <ExpandMoreIcon fontSize="small" sx={{ transform: "rotate(45deg)" }} />
                              </IconButton>
                            </Tooltip>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                ))}
              </Box>
            )}

            <Button
              variant="outlined"
              size="small"
              startIcon={<FolderOpenRoundedIcon />}
              onClick={async () => {
                setPickingRepo("__new__");
                try {
                  const res = await fetch("/api/filesystem/pick-directory");
                  const { path } = await res.json();
                  if (path) {
                    const name = path.split("/").filter(Boolean).pop() || path;
                    // Prompt for repo name
                    const repoName = window.prompt("Repository name (e.g. owner/repo):", name);
                    if (repoName?.trim()) {
                      savePath(repoName.trim(), path);
                      setToastMessage("Repository added");
                      setToast(true);
                    }
                  }
                } finally {
                  setPickingRepo(null);
                }
              }}
              disabled={pickingRepo !== null}
              sx={{
                borderColor: alpha("#7C5CFF", 0.4),
                color: "#7C5CFF",
                textTransform: "none",
                "&:hover": {
                  borderColor: "#7C5CFF",
                  bgcolor: alpha("#7C5CFF", 0.08),
                },
              }}
            >
              {pickingRepo === "__new__" ? "Selecting..." : "Add Repository"}
            </Button>
          </AccordionDetails>
        </Accordion>
      </Box>

      <Snackbar
        open={toast}
        autoHideDuration={3000}
        onClose={() => setToast(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert onClose={() => setToast(false)} severity="success" variant="filled">
          {toastMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}
