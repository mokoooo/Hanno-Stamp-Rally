import { useGetPrizeStatus, getGetPrizeStatusQueryKey, useGetStampCard, getGetStampCardQueryKey } from "@workspace/api-client-react";
import { BottomNav } from "@/components/BottomNav";
import { Loader2, Gift, Check, Trophy, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";

export default function Prizes() {
  const { data: prizeStatus, isLoading: prizeLoading } = useGetPrizeStatus({
    query: { queryKey: getGetPrizeStatusQueryKey() }
  });
  
  const { data: stampCard, isLoading: cardLoading } = useGetStampCard({
    query: { queryKey: getGetStampCardQueryKey() }
  });

  const isLoading = prizeLoading || cardLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!prizeStatus || !stampCard) {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center bg-background">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>エラー</AlertTitle>
          <AlertDescription>景品情報の読み込みに失敗しました。</AlertDescription>
        </Alert>
        <BottomNav />
      </div>
    );
  }

  const getTierIcon = (tier: string) => {
    switch(tier) {
      case 'bronze': return <Gift className="w-6 h-6 text-[#cd7f32]" />;
      case 'silver': return <Trophy className="w-6 h-6 text-slate-400" />;
      case 'complete': return <Trophy className="w-6 h-6 text-yellow-500" />;
      default: return <Gift className="w-6 h-6" />;
    }
  };

  const getTierColor = (tier: string) => {
    switch(tier) {
      case 'bronze': return "bg-[#cd7f32]/10 border-[#cd7f32]/30 text-[#cd7f32]";
      case 'silver': return "bg-slate-400/10 border-slate-400/30 text-slate-600";
      case 'complete': return "bg-yellow-500/10 border-yellow-500/30 text-yellow-600";
      default: return "bg-muted border-border";
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      {/* Header */}
      <header className="bg-card border-b border-border pt-12 pb-4 px-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold font-serif text-foreground flex items-center gap-2">
            <Gift className="w-5 h-5 text-primary" />
            景品交換
          </h1>
          <div className="text-sm font-medium bg-muted px-3 py-1 rounded-full">
            スタンプ: {stampCard.totalObtained}コ
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-6">
        {/* Instructions */}
        <div className="bg-secondary/10 border border-secondary/20 rounded-xl p-4">
          <h2 className="font-bold text-secondary-foreground mb-2 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center text-xs">i</span>
            交換方法
          </h2>
          <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
            <li>スタンプを集めると景品がアンロックされます。</li>
            <li>景品交換所にいるスタッフにこの画面を見せてください。</li>
            <li>スタッフが専用の確認画面から景品引き換えを行います。</li>
          </ul>
        </div>

        {/* Prizes List */}
        <div className="space-y-4">
          {prizeStatus.prizes.map((prize) => {
            const isLocked = !prize.eligible && !prize.redeemed;
            const progressValue = Math.min(100, (stampCard.totalObtained / prize.requiredStamps) * 100);

            return (
              <div 
                key={prize.tier}
                className={`relative overflow-hidden rounded-2xl border-2 p-5 transition-all
                  ${prize.redeemed ? 'bg-muted/50 border-border opacity-75' : 
                    prize.eligible ? getTierColor(prize.tier) : 'bg-card border-border'}
                `}
              >
                <div className="flex gap-4 items-start relative z-10">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-sm
                    ${prize.redeemed ? 'bg-background text-muted-foreground' : 
                      prize.eligible ? 'bg-background' : 'bg-muted text-muted-foreground'}
                  `}>
                    {getTierIcon(prize.tier)}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-bold text-lg">{prize.label}</h3>
                      {prize.redeemed && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded-full">
                          <Check className="w-3 h-3" />
                          交換済
                        </span>
                      )}
                      {prize.eligible && !prize.redeemed && (
                        <span className="inline-flex text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-1 rounded-full animate-pulse">
                          交換可能!
                        </span>
                      )}
                    </div>
                    
                    <p className="text-sm text-muted-foreground mb-3">
                      スタンプ{prize.requiredStamps}個で獲得
                    </p>

                    {isLocked && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground font-medium">
                          <span>達成まであと{prize.requiredStamps - stampCard.totalObtained}個</span>
                          <span>{stampCard.totalObtained} / {prize.requiredStamps}</span>
                        </div>
                        <Progress value={progressValue} className="h-1.5" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Decorative background element */}
                {prize.eligible && !prize.redeemed && (
                  <div className="absolute -right-8 -bottom-8 w-32 h-32 opacity-10 rotate-12 pointer-events-none">
                    {getTierIcon(prize.tier)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
