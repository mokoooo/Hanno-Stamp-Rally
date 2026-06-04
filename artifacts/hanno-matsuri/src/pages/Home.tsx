import { useEffect, useRef } from "react";
import { useGetStampCard, getGetStampCardQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "@/components/BottomNav";
import { StampGrid } from "@/components/StampGrid";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Home() {
  const queryClient = useQueryClient();
  const { data: stampCard, isLoading, error, refetch, isFetching } = useGetStampCard({
    query: {
      queryKey: getGetStampCardQueryKey(),
      // ビーコンはサーバー側で処理されるため、10秒ごとに自動再取得
      refetchInterval: 10_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    }
  });

  // アプリ復帰時（LINEから戻る・タブ切り替え）に即時再取得
  const lastFocusFetch = useRef(0);
  useEffect(() => {
    const fetchIfStale = () => {
      const now = Date.now();
      if (now - lastFocusFetch.current > 5_000) {
        lastFocusFetch.current = now;
        queryClient.invalidateQueries({ queryKey: getGetStampCardQueryKey() });
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") fetchIfStale();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", fetchIfStale);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", fetchIfStale);
    };
  }, [queryClient]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !stampCard) {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center bg-background">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>エラー</AlertTitle>
          <AlertDescription>
            スタンプカードの読み込みに失敗しました。
            <button onClick={() => refetch()} className="underline ml-2">再試行</button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const progressPercentage = (stampCard.totalObtained / stampCard.totalSpots) * 100;

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      {/* Header */}
      <header className="bg-primary text-primary-foreground pt-12 pb-6 px-4 rounded-b-[2rem] shadow-md relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml,%3Csvg width=\'20\' height=\'20\' viewBox=\'0 0 20 20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0h20v20H0V0zm10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm0-2a5 5 0 1 1 0-10 5 5 0 0 1 0 10z\' fill=\'%23ffffff\' fill-rule=\'evenodd\'/%3E%3C/svg%3E')]"></div>
        <div className="relative z-10 max-w-md mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-serif font-bold tracking-wider">飯能まつり</h1>
              <p className="text-primary-foreground/80 text-sm mt-1">デジタルスタンプラリー</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => refetch()}
                disabled={isFetching}
                className="text-primary-foreground hover:bg-primary-foreground/20 rounded-full w-10 h-10"
                title="スタンプカードを更新"
              >
                <RefreshCw className={`w-5 h-5 ${isFetching ? "animate-spin" : ""}`} />
              </Button>
              {stampCard.pictureUrl && (
                <img
                  src={stampCard.pictureUrl}
                  alt={stampCard.displayName}
                  className="w-12 h-12 rounded-full border-2 border-primary-foreground shadow-sm"
                />
              )}
            </div>
          </div>

          <div className="bg-background/10 backdrop-blur-sm rounded-xl p-4 border border-primary-foreground/20">
            <div className="flex justify-between items-end mb-2">
              <span className="text-sm font-medium">現在のスタンプ</span>
              <div className="flex items-baseline">
                <span className="text-3xl font-bold font-mono">{stampCard.totalObtained}</span>
                <span className="text-sm ml-1 opacity-80">/{stampCard.totalSpots}</span>
              </div>
            </div>
            <Progress value={progressPercentage} className="h-2 bg-primary-foreground/20 [&>div]:bg-secondary" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto p-4 mt-4 space-y-6">
        {/* ビーコン更新ガイド */}
        <section className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="text-blue-500 text-xl">📡</div>
          <div className="flex-1">
            <p className="text-sm text-blue-700">
              お神輿の近くでビーコンを受信すると自動でスタンプが付与されます。
            </p>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="mt-1 text-xs text-blue-600 underline flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
              スタンプを今すぐ更新
            </button>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-4 px-2">
            <h2 className="text-lg font-bold font-serif flex items-center">
              <span className="w-1 h-5 bg-secondary rounded-full mr-2"></span>
              スタンプカード
            </h2>
          </div>

          <StampGrid stamps={stampCard.stamps} />
        </section>

        {stampCard.prizeStatus.prizes.some(p => p.eligible && !p.redeemed) && (
          <section className="bg-secondary/10 border border-secondary/30 rounded-xl p-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-secondary/20 rounded-bl-full -mr-4 -mt-4"></div>
            <h3 className="font-bold text-secondary-foreground mb-2 relative z-10 text-orange-700">景品が受け取れます！</h3>
            <p className="text-sm text-muted-foreground relative z-10 mb-3">
              受付にてスタッフに画面を提示してください。
            </p>
          </section>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
