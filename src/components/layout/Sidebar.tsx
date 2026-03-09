"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import { alpha } from "@mui/material/styles";
import Badge from "@mui/material/Badge";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import MergeTypeRoundedIcon from "@mui/icons-material/MergeTypeRounded";
import BugReportRoundedIcon from "@mui/icons-material/BugReportRounded";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import AutoFixHighRoundedIcon from "@mui/icons-material/AutoFixHighRounded";
import ChecklistRoundedIcon from "@mui/icons-material/ChecklistRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import Image from "next/image";
import { usePendingTodoCount } from "@/hooks/usePendingTodoCount";

export const SIDEBAR_WIDTH = 220;

export default function Sidebar() {
  const pathname = usePathname();
  const pendingCount = usePendingTodoCount();

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: <DashboardRoundedIcon /> },
    { label: "Issues", href: "/issues", icon: <BugReportRoundedIcon /> },
    { label: "PRs", href: "/prs", icon: <MergeTypeRoundedIcon /> },
    { label: "Agents", href: "/agents", icon: <SmartToyRoundedIcon /> },
    { label: "Skills", href: "/skills", icon: <AutoFixHighRoundedIcon /> },
    { label: "Todos", href: "/todos", icon: <ChecklistRoundedIcon />, badge: pendingCount },
    { label: "Settings", href: "/settings", icon: <SettingsRoundedIcon /> },
  ];

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: SIDEBAR_WIDTH,
          boxSizing: "border-box",
        },
      }}
    >
      <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "center", animation: "scaleIn 0.4s ease-out" }}>
        <Image
          src="/logo.svg"
          alt="Devora"
          width={170}
          height={40}
          priority
        />
      </Box>

      <List sx={{ px: 1.5, mt: 2 }}>
        {navItems.map((item, index) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link key={item.label} href={item.href} style={{ textDecoration: "none", color: "inherit" }}>
              <ListItemButton
                selected={active}
                sx={{
                  borderRadius: 1,
                  mb: 0.5,
                  px: 2,
                  py: 1,
                  animation: `slideInLeft 0.35s ease-out ${index * 0.05}s both`,
                  transition: "background-color 0.15s, transform 0.15s",
                  "&.Mui-selected": {
                    bgcolor: alpha("#7C5CFF", 0.18),
                    color: "#9A84FF",
                    "& .MuiListItemIcon-root": { color: "#9A84FF" },
                  },
                  "&:hover": {
                    bgcolor: alpha("#7C5CFF", 0.1),
                    transform: "translateX(4px)",
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36, color: "text.secondary" }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{ fontSize: "0.85rem", fontWeight: 500 }}
                />
                {"badge" in item && (item.badge ?? 0) > 0 && (
                  <Box
                    component="span"
                    sx={{
                      bgcolor: "#FF9800",
                      color: "#fff",
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      lineHeight: 1,
                      minWidth: 18,
                      height: 18,
                      borderRadius: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      px: 0.5,
                    }}
                  >
                    {(item.badge ?? 0) > 99 ? "99+" : item.badge}
                  </Box>
                )}
              </ListItemButton>
            </Link>
          );
        })}
      </List>
    </Drawer>
  );
}
