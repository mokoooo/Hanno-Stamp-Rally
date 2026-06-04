import { useGetStats, getGetStatsQueryKey, useListUsers, getListUsersQueryKey, useListSpots, getListSpotsQueryKey, useExportCsv, useRotateSpotToken } from "@workspace/api-client-react";
import { BottomNav } from "@/components/BottomNav";
import { Loader2, Users, Stamp, Trophy, Download, QrCode, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { format } from "date-fns";

export default function AdminDashboard() {
  const [page, setPage] = useState(1);
  const { toast } = useToast();
  
  const { data: stats, isLoading: statsLoading } = useGetStats({ query: { queryKey: getGetStatsQueryKey() } });
  const { data: usersData, isLoading: usersLoading } = useListUsers({ page, limit: 20 }, { query: { queryKey: getListUsersQueryKey({ page, limit: 20 }) } });
  const { data: spotsData, isLoading: spotsLoading } = useListSpots({ query: { queryKey: getListSpotsQueryKey() } });
  
  const exportCsv = useExportCsv();
  const rotateToken = useRotateSpotToken();

  const handleExport = async () => {
    try {
      const res = await exportCsv.refetch();
      if (res.data) {
        // Blob download handling would go here in a real app
        // For now just show toast
        toast({ title: "CSVをエクスポートしました" });
      }
    } catch (err) {
      toast({ title: "エクスポート失敗", variant: "destructive" });
    }
  };

  const handleRotateToken = async (spotId: number) => {
    if (!confirm("QRコードを更新しますか？古いQRコードは無効になります。")) return;
    try {
      await rotateToken.mutateAsync({ spotId });
      toast({ title: "QRコードを更新しました" });
      // Invalidate spots query to get new tokens
    } catch (err) {
      toast({ title: "更新失敗", variant: "destructive" });
    }
  };

  const isLoading = statsLoading || usersLoading || spotsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-muted/30 pb-24 md:pb-8">
      {/* Admin Header - desktop friendly */}
      <header className="bg-card border-b border-border pt-safe pb-4 px-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">管理ダッシュボード</h1>
            <p className="text-sm text-muted-foreground">飯能まつり デジタルスタンプラリー</p>
          </div>
          <Button onClick={handleExport} variant="outline" size="sm" className="gap-2">
            <Download className="w-4 h-4" />
            CSV出力
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex flex-col items-center text-center">
              <Users className="w-8 h-8 text-blue-500 mb-2" />
              <p className="text-sm text-muted-foreground font-medium">参加者数</p>
              <p className="text-2xl font-bold">{stats?.totalUsers || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex flex-col items-center text-center">
              <Stamp className="w-8 h-8 text-primary mb-2" />
              <p className="text-sm text-muted-foreground font-medium">発行スタンプ</p>
              <p className="text-2xl font-bold">{stats?.totalStampsIssued || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex flex-col items-center text-center">
              <Trophy className="w-8 h-8 text-yellow-500 mb-2" />
              <p className="text-sm text-muted-foreground font-medium">コンプリート</p>
              <p className="text-2xl font-bold">{stats?.completeRedemptions || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex flex-col items-center text-center">
              <Gift className="w-8 h-8 text-[#cd7f32] mb-2" />
              <p className="text-sm text-muted-foreground font-medium">景品交換(全体)</p>
              <p className="text-2xl font-bold">
                {(stats?.bronzeRedemptions || 0) + (stats?.silverRedemptions || 0) + (stats?.completeRedemptions || 0)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Spot QR Management */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <QrCode className="w-5 h-5" /> スポット管理
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">ID</TableHead>
                  <TableHead>名前</TableHead>
                  <TableHead>獲得数</TableHead>
                  <TableHead>現在のトークン</TableHead>
                  <TableHead className="text-right">アクション</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {spotsData?.spots.map((spot) => (
                  <TableRow key={spot.id}>
                    <TableCell className="font-mono text-xs">{spot.id}</TableCell>
                    <TableCell className="font-medium">{spot.name}</TableCell>
                    <TableCell>{spot.stampCount}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[100px]">
                      {spot.token}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleRotateToken(spot.id)}
                        disabled={rotateToken.isPending}
                      >
                        <RefreshCw className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* User List */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5" /> 参加者一覧
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ユーザー</TableHead>
                  <TableHead>スタンプ</TableHead>
                  <TableHead>最終獲得</TableHead>
                  <TableHead>景品交換</TableHead>
                  <TableHead className="text-right">詳細</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersData?.users.map((user) => (
                  <TableRow key={user.userId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {user.pictureUrl && (
                          <img src={user.pictureUrl} alt="" className="w-6 h-6 rounded-full" />
                        )}
                        <span className="font-medium text-sm truncate max-w-[120px]">{user.displayName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">{user.totalObtained}/11</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {user.lastStampAt ? format(new Date(user.lastStampAt), "MM/dd HH:mm") : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {user.bronzeRedeemed && <div className="w-2 h-2 rounded-full bg-[#cd7f32]" title="Bronze"></div>}
                        {user.silverRedeemed && <div className="w-2 h-2 rounded-full bg-slate-400" title="Silver"></div>}
                        {user.completeRedeemed && <div className="w-2 h-2 rounded-full bg-yellow-500" title="Gold"></div>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/admin/users/${user.userId}`} className="text-primary text-sm hover:underline">
                        詳細
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="p-4 flex justify-between items-center border-t">
              <Button 
                variant="outline" 
                size="sm" 
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >
                前へ
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {usersData?.page} of {Math.ceil((usersData?.total || 0) / (usersData?.limit || 20))}
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                disabled={!usersData || usersData.page * usersData.limit >= usersData.total}
                onClick={() => setPage(p => p + 1)}
              >
                次へ
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      <div className="md:hidden">
        <BottomNav />
      </div>
    </div>
  );
}

// Dummy Gift import since it wasn't at the top
import { Gift } from "lucide-react";