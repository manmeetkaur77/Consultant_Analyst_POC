import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppStateProvider } from "./contexts/AppStateContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
// POC MODE: only consulting agent routes active
// import { ModuleProtectedRoute } from "./components/auth/ModuleProtectedRoute";
// import Login from "./pages/Login";
// import Dashboard from "./pages/Dashboard";
// import BRDAssistant from "./pages/BRDAssistant";
// import AnalystAgent from "./pages/AnalystAgent";
// import ConfluencePage from "./pages/ConfluencePage";
// import JiraPage from "./pages/JiraPage";
// import JiraGenerationPage from "./pages/JiraGenerationPage";
// import TestScenarioPage from "./pages/TestScenarioPage";
// import SessionDesignAssistant from "./pages/SessionDesignAssistant";
// import PairProgramming from "./pages/PairProgramming";
// import TestingPage from "./pages/TestingPage";
// import HarnessPage from "./pages/HarnessPage";
// import FigmaPage from "./pages/FigmaPage";
// import MyProfile from "./pages/MyProfile";
// import OrganizationUsage from "./pages/OrganizationUsage";
// import BRDSyncPage from "./pages/BRDSyncPage";
// import BRDComparisonPage from "./pages/BRDComparisonPage";
// import PRSyncPlaceholder from "./pages/PRSyncPlaceholder";
import ConsultingAgent from "./pages/ConsultingAgent";
import InsightsPage from "./pages/InsightsPage";
import NotFound from "./pages/NotFound";
const queryClient = new QueryClient();

// Sub-path prefix: reads VITE_BASE_PATH env var (e.g. "/sdlc/"), strips trailing slash for React Router
const basePath: string = import.meta.env.VITE_BASE_PATH
  ? String(import.meta.env.VITE_BASE_PATH).replace(/\/$/, '')
  : '/';

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppStateProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter basename={basePath}>
              <Routes>
                {/* POC MODE: redirect root to consulting agent */}
                <Route path="/" element={<Navigate to="/consulting-agent" replace />} />
                {/* Consulting Agent */}
                <Route
                  path="/consulting-agent"
                  element={
                    <ProtectedRoute>
                      <ConsultingAgent />
                    </ProtectedRoute>
                  }
                />
                {/* Insights — leadership portfolio view */}
                <Route
                  path="/insights"
                  element={
                    <ProtectedRoute>
                      <InsightsPage />
                    </ProtectedRoute>
                  }
                />
                {/* POC MODE: all other routes commented out
                <Route path="/login" element={<Login />} />
                <Route path="/brd-assistant" element={<BRDAssistant />} />
                <Route path="/analyst-agent" element={<AnalystAgent />} />
                <Route path="/confluence" element={<ConfluencePage />} />
                <Route path="/jira" element={<JiraPage />} />
                <Route path="/design-assistant" element={<SessionDesignAssistant />} />
                <Route path="/testing" element={<TestingPage />} />
                <Route path="/harness" element={<HarnessPage />} />
                <Route path="/figma" element={<FigmaPage />} />
                <Route path="/profile" element={<MyProfile />} />
                <Route path="/brd-sync" element={<BRDSyncPage />} />
                */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </AppStateProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
