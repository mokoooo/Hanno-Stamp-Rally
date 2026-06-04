import { useRoute } from "wouter";
import { useGetUserDetail, getGetUserDetailQueryKey, useRedeemPrize } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck, Gift, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { PrizeTierTier, RedeemPrizeBodyTier } from "@workspace/api-client-react";

export default function StaffVerify() {
  const [match, params] = useRoute("/staff/verify/:userId");
  const userId = params?.userId;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useGetUserDetail(userId || "", {
    query: { 
      enabled: !!userId,
      queryKey: getGetUserDetailQueryKey(userId || "")
    }
  });

  const redeemMutation = useRedeemPrize();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) return <div className="p-8 text-center">ユーザーが見つかりません</div>;

  const { user } = data;

  // Determine eligibility locally based on total stamps
  // In reality, this should match backend logic
  const isBronzeEligible = user.totalObtained >= 6;
  const isSilverEligible = user.totalObtained >= 11;
  const isCompleteEligible = user.totalObtained >= 11; // Simplified

  const handleRedeem = async (tier: RedeemPrizeBodyTier, label: string) => {
    if (!confirm(`【${label}】を交換済みにします。よろしいですか？`)) return;

    try {
      await redeemMutation.mutateAsync({
        data: { userId: user.userId, tier }
      });
      
      toast({ title: `${label}の交換処理が完了しました`, className: "bg-green-600 text-white" });
      queryClient.invalidateQueries({ queryKey: getGetUserDetailQueryKey(user.userId) });
    } catch (err) {
      toast({ title: "処理に失敗しました", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-[100dvh] bg-zinc-900 text-zinc-100 flex flex-col">
      <header className="bg-zinc-950 p-4 border-b border-zinc-800 text-center flex items-center justify-center gap-2">
        <ShieldCheck className="w-6 h-6 text-green-500" />
        <h1 className="font-bold tracking-wider">スタッフ確認モード</h1>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 max-w-sm mx-auto w-full space-y-6">
        <div className="text-center space-y-2">
          <p className="text-zinc-400 text-sm">お客様情報</p>
          <div className="flex items-center justify-center gap-3">
            {user.pictureUrl && <img src={user.pictureUrl} className="w-10 h-10 rounded-full" alt="" />}
            <h2 className="text-2xl font-bold text-white">{user.displayName}</h2>
          </div>
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <span className="text-4xl font-mono font-bold text-primary">{user.totalObtained}</span>
            <span className="text-zinc-400"> / 11スタンプ</span>
          </div>
        </div>

        <div className="w-full space-y-4">
          <h3 className="font-bold text-zinc-400 text-center mb-4">景品引き換え操作</h3>

          {/* Bronze Tier */}
          <Card className={`border-none ${user.bronzeRedeemed ? 'bg-zinc-800/50' : isBronzeEligible ? 'bg-[#cd7f32]/20 ring-1 ring-[#cd7f32]' : 'bg-zinc-800'}`}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Gift className={`w-6 h-6 ${user.bronzeRedeemed ? 'text-zinc-500' : isBronzeEligible ? 'text-[#cd7f32]' : 'text-zinc-600'}`} />
                <div>
                  <p className="font-bold text-white">ブロンズ賞</p>
                  <p className="text-xs text-zinc-400">スタンプ6個</p>
                </div>
              </div>
              {user.bronzeRedeemed ? (
                <span className="text-green-500 font-bold flex items-center text-sm"><CheckCircle2 className="w-4 h-4 mr-1"/> 渡済</span>
              ) : isBronzeEligible ? (
                <Button 
                  onClick={() => handleRedeem("bronze", "ブロンズ賞")}
                  disabled={redeemMutation.isPending}
                  className="bg-[#cd7f32] hover:bg-[#b06c28] text-white font-bold"
                >
                  引き換える
                </Button>
              ) : (
                <span className="text-zinc-500 text-sm">条件未達</span>
              )}
            </CardContent>
          </Card>

          {/* Silver Tier */}
          <Card className={`border-none ${user.silverRedeemed ? 'bg-zinc-800/50' : isSilverEligible ? 'bg-slate-400/20 ring-1 ring-slate-400' : 'bg-zinc-800'}`}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Gift className={`w-6 h-6 ${user.silverRedeemed ? 'text-zinc-500' : isSilverEligible ? 'text-slate-300' : 'text-zinc-600'}`} />
                <div>
                  <p className="font-bold text-white">シルバー賞</p>
                  <p className="text-xs text-zinc-400">スタンプ11個</p>
                </div>
              </div>
              {user.silverRedeemed ? (
                <span className="text-green-500 font-bold flex items-center text-sm"><CheckCircle2 className="w-4 h-4 mr-1"/> 渡済</span>
              ) : isSilverEligible ? (
                <Button 
                  onClick={() => handleRedeem("silver", "シルバー賞")}
                  disabled={redeemMutation.isPending}
                  className="bg-slate-500 hover:bg-slate-600 text-white font-bold"
                >
                  引き換える
                </Button>
              ) : (
                <span className="text-zinc-500 text-sm">条件未達</span>
              )}
            </CardContent>
          </Card>

          {/* Gold/Complete Tier */}
          <Card className={`border-none ${user.completeRedeemed ? 'bg-zinc-800/50' : isCompleteEligible ? 'bg-yellow-500/20 ring-1 ring-yellow-500' : 'bg-zinc-800'}`}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Gift className={`w-6 h-6 ${user.completeRedeemed ? 'text-zinc-500' : isCompleteEligible ? 'text-yellow-500' : 'text-zinc-600'}`} />
                <div>
                  <p className="font-bold text-white">コンプリート賞</p>
                  <p className="text-xs text-zinc-400">全制覇特典</p>
                </div>
              </div>
              {user.completeRedeemed ? (
                <span className="text-green-500 font-bold flex items-center text-sm"><CheckCircle2 className="w-4 h-4 mr-1"/> 渡済</span>
              ) : isCompleteEligible ? (
                <Button 
                  onClick={() => handleRedeem("complete", "コンプリート賞")}
                  disabled={redeemMutation.isPending}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold"
                >
                  引き換える
                </Button>
              ) : (
                <span className="text-zinc-500 text-sm">条件未達</span>
              )}
            </CardContent>
          </Card>

        </div>
        
        <p className="text-xs text-zinc-500 mt-8 text-center">
          この操作は取り消せません。<br/>確実に景品を手渡してからボタンを押してください。
        </p>
      </main>
    </div>
  );
}
