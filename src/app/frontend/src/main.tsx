import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Catalog from "./pages/Catalog";
import ModelCanvas from "./pages/ModelCanvas";
import Chat from "./pages/Chat";
import Approvals from "./pages/Approvals";
import Compare from "./pages/Compare";
import { ChatProvider } from "./state/ChatContext";
import { AppShell } from "./shell/AppShell";
import { ToastProvider } from "./ui/Toast";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ChatProvider>
          <AppShell>
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Catalog />} />
                <Route path="/chat" element={<Chat />} />
                <Route path="/canvas" element={<ModelCanvas />} />
                <Route path="/approvals" element={<Approvals />} />
                <Route path="/compare" element={<Compare />} />
              </Routes>
            </ErrorBoundary>
          </AppShell>
        </ChatProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
