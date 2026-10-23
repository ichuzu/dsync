import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import News from "./pages/News";
import Stats from "./pages/Stats";
import Backlog from "./pages/Backlog";
import Overlay from "./pages/Overlay";
import NotFound from "./pages/NotFound";
import Wiki from "./pages/Wiki";
import { SteamCallback } from "./components/SteamCallback";
import { SteamProvider } from "@/hooks/useSteam";
import { CollectionsProvider } from "@/hooks/useCollections";
import { HltbDailySync } from "@/hooks/useHltb";
import { ThemeProvider } from "./theme/ThemeProvider";

const queryClient = new QueryClient();

/**
 * The in-game overlay window loads /overlay. It gets only the theme: the
 * Steam and collections providers would start the main window's syncs again.
 */
const isOverlay = typeof window !== "undefined" && window.location.pathname.startsWith("/overlay");

const App = () =>
  isOverlay ? (
    <ThemeProvider>
      <Overlay />
    </ThemeProvider>
  ) : (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <SteamProvider>
        <CollectionsProvider>
        <HltbDailySync />
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/news" element={<News />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/backlog" element={<Backlog />} />
              <Route path="/wiki" element={<Wiki />} />
              <Route path="/designs" element={<Navigate to="/wiki" replace />} />
              <Route path="/steam-callback" element={<SteamCallback />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
        </CollectionsProvider>
      </SteamProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
