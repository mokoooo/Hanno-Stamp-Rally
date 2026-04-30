import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";
import { useApplyStamp, getGetStampCardQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

export default function Scan() {
  const [_, setLocation] = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(true);
  const [scannedData, setScannedData] = useState<string | null>(null);
  
  const queryClient = useQueryClient();
  const applyStamp = useApplyStamp();
  const { toast } = useToast();

  useEffect(() => {
    let isMounted = true;
    const codeReader = new BrowserQRCodeReader();

    const startScanner = async () => {
      if (!videoRef.current) return;
      
      try {
        const controls = await codeReader.decodeFromVideoDevice(
          undefined, // undefined = default camera
          videoRef.current,
          (result, err) => {
            if (result && isMounted) {
              handleScan(result.getText());
            }
            // Ignore stream errors (they happen every frame when no QR is found)
          }
        );
        if (isMounted) {
          controlsRef.current = controls;
        }
      } catch (err) {
        if (isMounted) {
          console.error("Camera error:", err);
          setError("カメラへのアクセスが拒否されたか、カメラが見つかりません。");
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      if (controlsRef.current) {
        controlsRef.current.stop();
      }
    };
  }, []);

  const handleScan = async (data: string) => {
    if (!isScanning) return;
    setIsScanning(false);
    if (controlsRef.current) {
      controlsRef.current.stop();
    }
    
    setScannedData(data);

    try {
      const res = await applyStamp.mutateAsync({
        data: {
          token: data,
          triggerType: "QR"
        }
      });

      if (res.success) {
        // Play success sound
        try {
          const audio = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU..."); // dummy beep
          // audio.play();
        } catch(e) {}

        queryClient.invalidateQueries({ queryKey: getGetStampCardQueryKey() });
        
        toast({
          title: "スタンプ獲得！",
          description: `${res.stamp.name}のスタンプをゲットしました！`,
        });

        // Redirect to home after a brief success message
        setTimeout(() => setLocation("/"), 2000);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || "スタンプの取得に失敗しました。無効なQRコードです。");
    }
  };

  const handleClose = () => {
    setLocation("/");
  };

  const handleRetry = () => {
    setError(null);
    setScannedData(null);
    setIsScanning(true);
    // Refresh page to restart scanner
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-4 text-white bg-gradient-to-b from-black/80 to-transparent absolute top-0 left-0 right-0 z-10">
        <h2 className="font-bold">QRスキャン</h2>
        <Button variant="ghost" size="icon" onClick={handleClose} className="text-white hover:bg-white/20 rounded-full">
          <X className="w-6 h-6" />
        </Button>
      </div>

      {/* Main Scanner Area */}
      <div className="flex-1 relative flex items-center justify-center bg-zinc-900">
        {isScanning && !error && (
          <>
            <video 
              ref={videoRef} 
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              muted
            />
            {/* Viewfinder overlay */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="w-full h-full flex flex-col">
                <div className="flex-1 bg-black/50" />
                <div className="flex h-64">
                  <div className="flex-1 bg-black/50" />
                  <div className="w-64 relative">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary" />
                    
                    {/* Scanning animation line */}
                    <div className="absolute left-0 right-0 h-0.5 bg-primary/80 animate-[scan_2s_ease-in-out_infinite]" />
                  </div>
                  <div className="flex-1 bg-black/50" />
                </div>
                <div className="flex-1 bg-black/50" />
              </div>
            </div>
            
            <p className="absolute bottom-24 text-white text-sm bg-black/60 px-4 py-2 rounded-full font-medium">
              スポットのQRコードを読み取ってください
            </p>
          </>
        )}

        {/* Processing State */}
        {!isScanning && !error && !applyStamp.isError && !applyStamp.isSuccess && (
          <div className="flex flex-col items-center text-white">
            <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
            <p className="font-medium">スタンプを処理中...</p>
          </div>
        )}

        {/* Success State */}
        {applyStamp.isSuccess && (
          <div className="flex flex-col items-center text-white animate-in zoom-in duration-300">
            <div className="w-24 h-24 bg-primary rounded-full flex items-center justify-center mb-4 shadow-[0_0_40px_rgba(220,38,38,0.5)]">
              <CheckCircle2 className="w-12 h-12 text-white" />
            </div>
            <h3 className="text-2xl font-bold font-serif tracking-wider">スタンプ獲得！</h3>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-6 w-full max-w-sm mx-auto">
            <Alert variant="destructive" className="bg-white text-destructive border-none shadow-xl">
              <AlertCircle className="h-5 w-5" />
              <AlertDescription className="text-sm font-medium ml-2">
                {error}
              </AlertDescription>
            </Alert>
            <Button 
              className="w-full mt-6 h-12 font-bold rounded-full bg-white text-black hover:bg-gray-200"
              onClick={handleRetry}
            >
              もう一度スキャンする
            </Button>
          </div>
        )}
      </div>
      
      <style>{`
        @keyframes scan {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
