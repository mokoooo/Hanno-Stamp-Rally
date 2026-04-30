import { useRoute, Link } from "wouter";
import { useGetUserDetail, getGetUserDetailQueryKey } from "@workspace/api-client-react";
import { Loader2, ArrowLeft, CheckCircle2, Clock } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StampGrid } from "@/components/StampGrid";

export default function AdminUserDetail() {
  const [match, params] = useRoute("/admin/users/:userId");
  const userId = params?.userId;

  const { data, isLoading } = useGetUserDetail(userId || "", {
    query: { 
      enabled: !!userId,
      queryKey: getGetUserDetailQueryKey(userId || "")
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) return <div className="p-8 text-center text-muted-foreground">ユーザーが見つかりません</div>;

  const { user, stamps } = data;

  return (
    <div className="min-h-screen bg-muted/30 pb-12">
      <header className="bg-card border-b border-border pt-safe pb-4 px-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <Link href="/admin" className="p-2 -ml-2 rounded-full hover:bg-muted text-muted-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-bold text-foreground">ユーザー詳細</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-6 mt-4">
        {/* User Profile */}
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            {user.pictureUrl ? (
              <img src={user.pictureUrl} alt="" className="w-16 h-16 rounded-full shadow-sm" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
                {user.displayName.charAt(0)}
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold">{user.displayName}</h2>
              <p className="text-sm text-muted-foreground font-mono mt-1">ID: {user.userId}</p>
            </div>
          </CardContent>
        </Card>

        {/* Status Overview */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">スタンプ獲得状況</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-mono text-primary">{user.totalObtained}<span className="text-lg text-muted-foreground">/11</span></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">景品交換状況</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${user.bronzeRedeemed ? 'bg-[#cd7f32]' : 'bg-muted'}`} />
                  <span className={user.bronzeRedeemed ? 'text-foreground' : 'text-muted-foreground'}>ブロンズ (6コ)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${user.silverRedeemed ? 'bg-slate-400' : 'bg-muted'}`} />
                  <span className={user.silverRedeemed ? 'text-foreground' : 'text-muted-foreground'}>シルバー (11コ)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${user.completeRedeemed ? 'bg-yellow-500' : 'bg-muted'}`} />
                  <span className={user.completeRedeemed ? 'text-foreground' : 'text-muted-foreground'}>コンプリート</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Card Visualization */}
        <Card>
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-base">デジタルスタンプカード</CardTitle>
          </CardHeader>
          <CardContent className="p-4 bg-background">
            <StampGrid stamps={stamps} />
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4" /> 獲得タイムライン
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {stamps.filter(s => s.obtained).sort((a, b) => new Date(b.obtainedAt!).getTime() - new Date(a.obtainedAt!).getTime()).map((stamp) => (
                <div key={stamp.id} className="p-4 flex items-start gap-3">
                  <div className="mt-0.5 text-primary">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{stamp.name}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-1">
                      {format(new Date(stamp.obtainedAt!), "yyyy/MM/dd HH:mm:ss")}
                    </p>
                  </div>
                </div>
              ))}
              {stamps.filter(s => s.obtained).length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  まだスタンプを獲得していません
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
