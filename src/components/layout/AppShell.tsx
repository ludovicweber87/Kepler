"use client";

import { useState, useMemo } from "react";
import Box from "@mui/material/Box";
import Sidebar from "./Sidebar";
import Header from "./Header";
import RightSidebar, { RIGHT_SIDEBAR_WIDTH } from "./RightSidebar";
import { RightSidebarContext } from "@/hooks/useRightSidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [rightOpen, setRightOpen] = useState(true);
  const [rightWidth, setRightWidth] = useState(RIGHT_SIDEBAR_WIDTH);

  const ctx = useMemo(
    () => ({
      open: rightOpen,
      toggle: () => setRightOpen((v) => !v),
      width: rightWidth,
      setWidth: setRightWidth,
    }),
    [rightOpen, rightWidth]
  );

  return (
    <RightSidebarContext.Provider value={ctx}>
      <Box sx={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <Header />
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            mt: "64px",
            p: { xs: 2, md: 4 },
            bgcolor: "background.default",
            minHeight: "calc(100vh - 64px)",
            transition: "margin-right 0.2s",
          }}
        >
          {children}
        </Box>
        <RightSidebar />
      </Box>
    </RightSidebarContext.Provider>
  );
}
