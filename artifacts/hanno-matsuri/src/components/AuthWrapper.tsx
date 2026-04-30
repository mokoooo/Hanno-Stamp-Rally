import { useEffect, useState } from "react";
import { useGetMe, useLineLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import { useLiff } from "@/hooks/use-liff";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

interface AuthWrapperProps {
  children: React.ReactNode;
}

export function AuthWrapper({ children }: AuthWrapperProps) {
  const { data: user, isLoading: userLoading, error: userError } = useGetMe(undefined, {
    query: { 
      retry: false,
      queryKey: getGetMeQueryKey(),
      refetchOnWindowFocus: false,
    }
  });

  const { liff, liffError, isInitialized: liffInitialized } = useLiff();
  const loginMutation = useLineLogin();
  const queryClient = useQueryClient();
  const [isProcessingLogin, setIsProcessingLogin] = useState(false);

  useEffect(() => {
    const processLiffLogin = async () => {
      if (!liffInitialized || !liff || user || isProcessingLogin || userLoading) return;

      try {
        if (liff.isLoggedIn()) {
          setIsProcessingLogin(true);
          const idToken = liff.getDecodedIDToken();
          const profile = await liff.getProfile();
          
          if (idToken) {
            await loginMutation.mutateAsync({
              data: {
                idToken: liff.getIDToken() || "",
                displayName: profile.displayName,
                pictureUrl: profile.pictureUrl
              }
            });
            queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          }
        }
      } catch (error) {
        console.error("Failed to process LIFF login:", error);
      } finally {
        setIsProcessingLogin(false);
      }
    };

    processLiffLogin();
  }, [liffInitialized, liff, user, userLoading, loginMutation, queryClient, isProcessingLogin]);

  // While checking initial session (only show loading if we have a valid session token to check)
  const hasStoredToken = typeof window !== "undefined" && (
    document.cookie.includes("session_token") ||
    localStorage.getItem("session_token")
  );
  if (userLoading && hasStoredToken) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground font-medium animate-pulse">
          お祭りの準備をしています...
        </p>
      </div>
    );
  }

  // Once we confirm the user is logged in, show app
  if (user) {
    return <>{children}</>;
  }

  // Not logged in. Show login button.
  // In a real LIFF app, we might call liff.login() directly, but for testing/web:
  const handleLogin = () => {
    if (liff && !liff.isLoggedIn()) {
      liff.login();
    } else {
      // Mock login for non-LIFF dev environment
      loginMutation.mutate({
        data: {
          idToken: "mock-id-token",
          displayName: "テストユーザー",
          pictureUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=test"
        }
      }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        }
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 bg-[url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23d32f2f\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')]">
      <div className="w-full max-w-sm space-y-8 text-center bg-card p-8 rounded-xl shadow-lg border border-border relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-primary"></div>
        <div className="space-y-2 relative z-10">
          <h1 className="text-3xl font-serif font-bold text-primary tracking-wider">
            飯能まつり
          </h1>
          <p className="text-lg font-medium text-foreground">
            デジタルスタンプラリー
          </p>
        </div>
        
        <div className="space-y-4">
          <Button 
            className="w-full h-14 text-lg font-bold rounded-full bg-[#06C755] hover:bg-[#05b34c] text-white shadow-md transition-transform active:scale-95"
            onClick={handleLogin}
            disabled={loginMutation.isPending || isProcessingLogin}
            data-testid="button-login"
          >
            {loginMutation.isPending || isProcessingLogin ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              "LINEでログインして参加"
            )}
          </Button>
          
          {liffError && (
            <p className="text-sm text-destructive mt-2" data-testid="text-error">
              LIFFの初期化に失敗しました。モックログインを使用します。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
