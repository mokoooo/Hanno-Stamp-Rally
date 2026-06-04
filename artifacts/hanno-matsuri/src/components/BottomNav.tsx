import { Link, useLocation } from "wouter";
import { Home, ScanLine, Gift, Settings } from "lucide-react";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";

export function BottomNav() {
  const [location] = useLocation();
  const { data: user } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.05)] pb-safe">
      <div className="max-w-md mx-auto flex items-center justify-around h-16 px-4">
        <Link href="/" className={`flex flex-col items-center justify-center w-16 h-full transition-colors ${location === "/" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`} data-testid="nav-home">
          <Home className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-medium">スタンプ</span>
        </Link>
        
        <Link href="/scan" className="relative -top-4 flex flex-col items-center justify-center w-16 h-full" data-testid="nav-scan">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 ${location === "/scan" ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground"}`}>
            <ScanLine className="w-7 h-7" />
          </div>
          <span className="text-[10px] font-bold mt-1 text-primary">スキャン</span>
        </Link>
        
        <Link href="/prizes" className={`flex flex-col items-center justify-center w-16 h-full transition-colors ${location === "/prizes" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`} data-testid="nav-prizes">
          <Gift className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-medium">景品</span>
        </Link>

        {user?.isAdmin && (
          <Link href="/admin" className={`flex flex-col items-center justify-center w-16 h-full transition-colors ${location.startsWith("/admin") ? "text-primary" : "text-muted-foreground hover:text-foreground"}`} data-testid="nav-admin">
            <Settings className="w-6 h-6 mb-1" />
            <span className="text-[10px] font-medium">管理</span>
          </Link>
        )}
      </div>
    </div>
  );
}
