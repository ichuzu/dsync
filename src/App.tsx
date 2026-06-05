import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider as MuiThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import News from "./pages/News";
import Stats from "./pages/Stats";
import NotFound from "./pages/NotFound";
import { SteamCallback } from "./components/SteamCallback";
import { SteamProvider } from "@/hooks/useSteam";
import { CollectionsProvider } from "@/hooks/useCollections";
import { muiTheme } from "./theme/muiTheme";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <MuiThemeProvider theme={muiTheme}>
      <SteamProvider>
        <CollectionsProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/news" element={<News />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/steam-callback" element={<SteamCallback />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
        </CollectionsProvider>
      </SteamProvider>
    </MuiThemeProvider>
  </QueryClientProvider>
);

export default App;
