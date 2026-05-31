import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, AlertCircle } from "lucide-react";
import { useSteam } from "@/hooks/useSteam";
import { toast } from "@/hooks/use-toast";

export const SteamCallback = () => {
  const navigate = useNavigate();
  const { completeLogin } = useSteam();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { profile } = await completeLogin(window.location.search);
        if (cancelled) return;
        toast({
          title: "Signed in with Steam",
          description: profile?.name
            ? `Welcome, ${profile.name}. Syncing your library…`
            : "Syncing your library…",
        });
        navigate("/", { replace: true });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Steam sign-in failed.";
        setError(message);
        toast({
          title: "Steam sign-in failed",
          description: message,
          variant: "destructive",
        });
        setTimeout(() => navigate("/", { replace: true }), 3000);
      }
    })();

    return () => {
      cancelled = true;
    };
    // completeLogin is stable (useCallback); run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        {error ? (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/15">
              <AlertCircle className="h-7 w-7 text-destructive" />
            </div>
            <h2 className="mb-1 text-xl font-semibold text-foreground">
              Sign-in failed
            </h2>
            <p className="max-w-sm text-muted-foreground">{error}</p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
            <h2 className="mb-1 text-xl font-semibold text-foreground">
              Finishing Steam sign-in…
            </h2>
            <p className="text-muted-foreground">Verifying your account, hang tight.</p>
          </>
        )}
      </div>
    </div>
  );
};
