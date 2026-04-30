import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";
import { useApplyStamp, getGetStampCardQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2, X, AlertCircle, CheckCircle2, Camera, Settings,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type ScanState = "requesting" | "scanning" | "processing" | "success" | "error";
type PermissionError = "denied" | "no-camera" | "insecure" | "unknown";

function getPermissionError(err: unknown): PermissionError {
  if (!(err instanceof Error)) return "unknown";
  const name = err.name;
  const msg = err.message.toLowerCase();
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "no-camera";
  if (msg.includes("secure") || msg.includes("https")) return "insecure";
  return "unknown";
}

function isIOS(): boolean {
  return /iP(hone|ad|od)/.test(navigator.userAgent);
}

function isLineApp(): boolean {
  return /Line\//.test(navigator.userAgent);
}

export default function Scan() {
  const [, setLocation] = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const scannedRef = useRef(false);

  const [scanState, setScanState] = useState<ScanState>("requesting");
  const [permError, setPermError] = useState<PermissionError | null>(null);
  const [stampError, setStampError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const applyStamp = useApplyStamp();
  const { toast } = useToast();

  const stopScanner = useCallback(() => {
    if (controlsRef.current) {
      try { controlsRef.current.stop(); } catch { /* ignore */ }
      controlsRef.current = null;
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (!videoRef.current) return;
    setScanState("requesting");
    setPermError(null);

    // Explicitly request camera permission first for clear UX
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      // Permission granted — stop the test stream; zxing will open its own
      stream.getTracks().forEach(t => t.stop());
    } catch (err) {
      setPermError(getPermissionError(err));
      setScanState("error");
      return;
    }

    setScanState("scanning");

    try {
      const codeReader = new BrowserQRCodeReader();
      const controls = await codeReader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result) => {
          if (result && !scannedRef.current) {
            handleScan(result.getText());
          }
        }
      );
      controlsRef.current = controls;
    } catch (err) {
      setPermError(getPermissionError(err));
      setScanState("error");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    startScanner();
    return () => stopScanner();
  }, [startScanner, stopScanner]);

  const handleScan = async (data: string) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    stopScanner();
    setScanState("processing");

    try {
      const res = await applyStamp.mutateAsync({ data: { token: data, triggerType: "QR" } });
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: getGetStampCardQueryKey() });
        setScanState("success");
        toast({ title: "スタンプ獲得！", description: `${res.stamp.name}のスタンプをゲットしました！` });
        setTimeout(() => setLocation("/"), 2200);
      }
    } catch (err: any) {
      const msg = err?.data?.message ?? err?.message ?? "スタンプの取得に失敗しました";
      setStampError(msg);
      setScanState("error");
      setPermError(null);
    }
  };

  const handleRetry = () => {
    scannedRef.current = false;
    setStampError(null);
    setPermError(null);
    startScanner();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" data-testid="scan-page">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 h-16 flex items-center justify-between px-4 bg-gradient-to-b from-black/80 to-transparent">
        <h2 className="font-bold text-white">QRスキャン</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => { stopScanner(); setLocation("/"); }}
          className="text-white hover:bg-white/20 rounded-full"
          data-testid="button-scan-close"
        >
          <X className="w-6 h-6" />
        </Button>
      </div>

      {/* Camera view */}
      <div className="flex-1 relative flex items-center justify-center bg-zinc-900">

        {/* Live camera feed */}
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${scanState === "scanning" ? "opacity-100" : "opacity-0"}`}
          playsInline
          muted
          data-testid="video-scanner"
        />

        {/* Viewfinder (only when scanning) */}
        {scanState === "scanning" && (
          <>
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
                    <div
                      className="absolute left-0 right-0 h-0.5 bg-primary/80"
                      style={{ animation: "scan 2s ease-in-out infinite" }}
                    />
                  </div>
                  <div className="flex-1 bg-black/50" />
                </div>
                <div className="flex-1 bg-black/50" />
              </div>
            </div>
            <p className="absolute bottom-24 text-white text-sm bg-black/60 px-4 py-2 rounded-full font-medium">
              スポットのQRコードを枠内に合わせてください
            </p>
          </>
        )}

        {/* Requesting permission spinner */}
        {scanState === "requesting" && (
          <div className="flex flex-col items-center text-white gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-sm">カメラを起動中...</p>
          </div>
        )}

        {/* Processing */}
        {scanState === "processing" && (
          <div className="flex flex-col items-center text-white gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="font-medium">スタンプを処理中...</p>
          </div>
        )}

        {/* Success */}
        {scanState === "success" && (
          <div className="flex flex-col items-center text-white gap-4 animate-in zoom-in duration-300">
            <div className="w-24 h-24 bg-primary rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(220,38,38,0.5)]">
              <CheckCircle2 className="w-12 h-12 text-white" />
            </div>
            <h3 className="text-2xl font-bold font-serif tracking-wider">スタンプ獲得！</h3>
          </div>
        )}

        {/* Error: camera permission denied */}
        {scanState === "error" && permError && (
          <div className="p-6 w-full max-w-sm mx-auto flex flex-col gap-4" data-testid="scan-permission-error">
            <div className="bg-white rounded-2xl p-6 text-center shadow-xl space-y-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <Camera className="w-8 h-8 text-red-500" />
              </div>

              {permError === "denied" && (
                <>
                  <h3 className="font-bold text-lg text-gray-900">カメラの許可が必要です</h3>
                  <p className="text-sm text-gray-600">
                    QRコードを読み取るにはカメラのアクセスを許可してください。
                  </p>
                  {isIOS() && isLineApp() && (
                    <div className="bg-gray-50 rounded-xl p-4 text-left text-sm text-gray-700 space-y-1">
                      <p className="font-semibold">LINEアプリでの許可手順：</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>iPhoneの「設定」を開く</li>
                        <li>「LINE」をタップ</li>
                        <li>「カメラ」を<span className="font-semibold">オン</span>にする</li>
                        <li>LINEに戻り、再度スキャンを試す</li>
                      </ol>
                    </div>
                  )}
                  {isIOS() && !isLineApp() && (
                    <div className="bg-gray-50 rounded-xl p-4 text-left text-sm text-gray-700 space-y-1">
                      <p className="font-semibold">Safariでの許可手順：</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>「設定」→「Safari」を開く</li>
                        <li>「カメラ」→「許可」にする</li>
                        <li>ページを再読み込みして再試行</li>
                      </ol>
                    </div>
                  )}
                  {!isIOS() && (
                    <div className="bg-gray-50 rounded-xl p-4 text-left text-sm text-gray-700 space-y-1">
                      <p className="font-semibold">カメラを許可する手順：</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>ブラウザのアドレスバー横の 🔒 をタップ</li>
                        <li>「カメラ」を「許可」に変更</li>
                        <li>ページを再読み込み</li>
                      </ol>
                    </div>
                  )}
                </>
              )}

              {permError === "no-camera" && (
                <>
                  <h3 className="font-bold text-lg text-gray-900">カメラが見つかりません</h3>
                  <p className="text-sm text-gray-600">
                    端末にカメラが接続されていないか、他のアプリが使用中です。
                  </p>
                </>
              )}

              {permError === "unknown" && (
                <>
                  <h3 className="font-bold text-lg text-gray-900">カメラを起動できませんでした</h3>
                  <p className="text-sm text-gray-600">
                    カメラへのアクセスに失敗しました。ブラウザの設定を確認してください。
                  </p>
                </>
              )}

              <div className="flex flex-col gap-2 pt-2">
                <Button
                  className="w-full h-12 font-bold rounded-full"
                  onClick={handleRetry}
                  data-testid="button-retry-scan"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  再試行する
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-12 font-bold rounded-full"
                  onClick={() => { stopScanner(); setLocation("/"); }}
                >
                  スタンプカードに戻る
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Error: stamp apply failed */}
        {scanState === "error" && stampError && (
          <div className="p-6 w-full max-w-sm mx-auto" data-testid="scan-stamp-error">
            <div className="bg-white rounded-2xl p-6 text-center shadow-xl space-y-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="font-bold text-lg text-gray-900">スタンプを取得できませんでした</h3>
              <p className="text-sm text-gray-600">{stampError}</p>
              <div className="flex flex-col gap-2 pt-2">
                <Button
                  className="w-full h-12 font-bold rounded-full"
                  onClick={handleRetry}
                  data-testid="button-retry-after-stamp-error"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  もう一度スキャンする
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-12 font-bold rounded-full"
                  onClick={() => { stopScanner(); setLocation("/"); }}
                >
                  スタンプカードに戻る
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes scan {
          0%   { top: 0%;   opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
