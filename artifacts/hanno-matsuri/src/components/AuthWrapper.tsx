import { useEffect, useState, useCallback } from "react";
import { useGetMe, useLineLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import { useLiff } from "@/hooks/use-liff";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";

interface AuthWrapperProps {
  children: React.ReactNode;
}

const SESSION_KEY = "stamp_session_token";

export function AuthWrapper({ children }: AuthWrapperProps) {
  const storedToken = typeof window !== "undefined" ? localStorage.getItem(SESSION_KEY) : null;

  const { data: user, isLoading: userLoading } = useGetMe({
    query: {
      retry: false,
      queryKey: getGetMeQueryKey(),
      refetchOnWindowFocus: false,
    },
  });

  const { liff, liffError, isInitialized: liffInitialized } = useLiff();
  const loginMutation = useLineLogin();
  const queryClient = useQueryClient();
  const [isProcessingLogin, setIsProcessingLogin] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const performLogin = useCallback(async (idToken: string, displayName?: string, pictureUrl?: string) => {
    setLoginError(null);
    setIsProcessingLogin(true);
    try {
      const result = await loginMutation.mutateAsync({
        data: { idToken, displayName, pictureUrl },
      });
      if (result.sessionToken) {
        localStorage.setItem(SESSION_KEY, result.sessionToken);
      }
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (err: any) {
      const msg = err?.data?.message ?? err?.message ?? "ログインに失敗しました";
      setLoginError(msg);
      throw err;
    } finally {
      setIsProcessingLogin(false);
    }
  }, [loginMutation, queryClient]);

  // LIFF初期化後に自動ログイン
  // withLoginOnExternalBrowser: true により、外部ブラウザでもLINE認証済みの状態で
  // init() が完了するため、isLoggedIn() === true になるはずだが、
  // 未ログインのままの場合は liff.login() を呼び出してリダイレクト。
  useEffect(() => {
    const processLiffLogin = async () => {
      if (!liffInitialized || !liff || user || isProcessingLogin || userLoading) return;

      // 未ログインなら LINE ログインへリダイレクト（外部ブラウザも含む）
      if (!liff.isLoggedIn()) {
        liff.login();
        return;
      }

      try {
        setIsProcessingLogin(true);
        const rawToken = liff.getIDToken();
        const profile = await liff.getProfile();

        if (rawToken) {
          // IDトークン(JWT)がある場合 → sub が LINE userId ("Uxxxxxxxx")
          await performLogin(rawToken, profile.displayName, profile.pictureUrl);
        } else {
          // openidスコープなし（通常は発生しない）→ profile.userId をそのまま使う
          await performLogin(profile.userId, profile.displayName, profile.pictureUrl);
        }
      } catch (err) {
        console.error("LIFF auto-login failed:", err);
      } finally {
        setIsProcessingLogin(false);
      }
    };

    processLiffLogin();
  }, [liffInitialized, liff, user, userLoading, performLogin, isProcessingLogin]);

  // セッション確認中 or ログイン処理中
  if ((userLoading && storedToken) || isProcessingLogin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground font-medium animate-pulse">
          お祭りの準備をしています...
        </p>
      </div>
    );
  }

  // ログイン済み
  if (user) {
    return <>{children}</>;
  }

  // LIFFなし（開発環境）またはLIFF初期化失敗時のフォールバック画面
  const handleLogin = async () => {
    setLoginError(null);

    if (liff) {
      if (!liff.isLoggedIn()) {
        liff.login();
        return;
      }
      try {
        setIsProcessingLogin(true);
        const rawToken = liff.getIDToken();
        const profile = await liff.getProfile();
        if (rawToken) {
          await performLogin(rawToken, profile.displayName, profile.pictureUrl);
        } else {
          await performLogin(profile.userId, profile.displayName, profile.pictureUrl);
        }
      } catch (err: any) {
        console.error("Manual LIFF login failed:", err);
      } finally {
        setIsProcessingLogin(false);
      }
      return;
    }

    // 開発環境フォールバック
    await performLogin("mock-id-token", "テストユーザー", "https://api.dicebear.com/7.x/avataaars/svg?seed=test");
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-background p-4"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d32f2f' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
      }}
    >
      <div className="w-full max-w-sm space-y-8 text-center bg-card p-8 rounded-xl shadow-lg border border-border relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-primary" />
        <div className="space-y-2 relative z-10">
          <h1 className="text-3xl font-serif font-bold text-primary tracking-wider">
            飯能まつり
          </h1>
          <p className="text-lg font-medium text-foreground">デジタルスタンプラリー</p>
        </div>

        <div className="space-y-3">
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

          {(loginError || liffError) && (
            <div
              className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm text-left"
              data-testid="text-login-error"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p>{loginError ?? "LIFFの初期化に失敗しました"}</p>
                <button
                  className="mt-1 underline text-xs flex items-center gap-1"
                  onClick={() => { setLoginError(null); handleLogin(); }}
                  data-testid="button-retry-login"
                >
                  <RefreshCw className="w-3 h-3" /> もう一度試す
                </button>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            LINEアプリからアクセスしてください
          </p>
        </div>
      </div>
    </div>
  );
}
