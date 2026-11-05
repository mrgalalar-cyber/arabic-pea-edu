import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource/tajawal/400.css"; import "@fontsource/tajawal/500.css"; import "@fontsource/tajawal/700.css"; import "@fontsource/tajawal/800.css";
import "@fontsource/amiri/400.css"; import "@fontsource/amiri/700.css";
import "./styles/global.css";
import { App } from "./App";
import { ThemeProvider } from "./lib/theme";
import { AuthProvider } from "./lib/auth";
import { ToastProvider } from "./lib/ui";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider><ToastProvider><AuthProvider><BrowserRouter><App /></BrowserRouter></AuthProvider></ToastProvider></ThemeProvider>
  </StrictMode>
);
