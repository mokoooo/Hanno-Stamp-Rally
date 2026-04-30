import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";
import { useApplyStamp, getGetStampCardQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, X, CheckCircle2, Camera, RefreshCw, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLiff } from "@/hooks/use-liff";

type ScanState = "idle" | "requesting" | "scanning" | "liff-scanning" | "processing" | "success" | "error";

type ScanError =
  | { kind: "permission-denied" }
  | { kind: "no-camera" }
  | { kind: "liff-no-feature" }
  | { kind: "stamp"; message: string }
  | { kind: "unknown"; message: string };

function getMediaError(err: unknown): ScanError {
  if (!(err instanceof Error)) return { kind: "unknown", message: String(err) };
  if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
    return { kind: "permission-denied" };
  if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError")
    return { kind: "no-camera" };
  return { kind: "unknown", message: err.message };
}

function isIOS() {
  return /iP(hone|ad|od)/.test(navigator.userAgent);
}

export default function Scan() {
  const [, setLocation] = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const scannedRef = useRef(false);

  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scanError, setScanError] = useState<ScanError | null>(null);

  const { liff, isInitialized: liffReady } = useLiff();
  const queryClient = useQueryClient();
  const applyStamp = useApplyStamp();
  const { toast } = useToast();

  /** True when running inside the LINE app and scanCodeV2 is available */
  const canUseLiffScanner = liffReady && liff && typeof liff.scanCodeV2 === "function";

  const stopCameraScanner = useCallback(() => {
    if (controlsRef.current) {
      try { controlsRef.current.stop(); } catch { /* ignore */ }
      controlsRef.current = null;
    }
  }, []);

  const handleScannedValue = useCallback(async (value: string) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    stopCameraScanner();
    setScanState("processing");

    try {
      const res = await applyStamp.mutateAsync({ data: { token: value, triggerType: "QR" } });
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: getGetStampCardQueryKey() });
        setScanState("success");
        toast({ title: "スタンプ獲得！", description: `${res.stamp.name}のスタンプをゲットしました！` });
        setTimeout(() => setLocation("/"), 2200);
      }
    } catch (err: any) {
      const message = err?.data?.message ?? err?.message ?? "スタンプの取得に失敗しました";
      setScanError({ kind: "stamp", message });
      setScanState("error");
    }
  }, [applyStamp, queryClient, stopCameraScanner, setLocation, toast]);

  /** Use LINE's native QR scanner (no camera permission needed) */
  const startLiffScan = useCallback(async () => {
    if (!liff) return;
    scannedRef.current = false;
    setScanError(null);
    setScanState("liff-scanning");
    try {
      const result = await liff.scanCodeV2();
      if (result?.value) {
        await handleScannedValue(result.value);
      } else {
        // User cancelled (closed the scanner without scanning)
        setScanState("idle");
      }
    } catch (err: any) {
      // Feature not enabled in LINE Developer Console
      if (err?.code === "FORBIDDEN" || String(err?.message).includes("not available")) {
        setScanError({ kind: "liff-no-feature" });
        setScanState("error");
      } else if (err?.code === "CANCEL") {
        // User cancelled — just go back idle
        setScanState("idle");
      } else {
        setScanError({ kind: "unknown", message: err?.message ?? "不明なエラーが発生しました" });
        setScanState("error");
      }
    }
  }, [liff, handleScannedValue]);

  /** Use browser camera (regular browser / fallback) */
  const startCameraScan = useCallback(async () => {
    if (!videoRef.current) return;
    scannedRef.current = false;
    setScanError(null);
    setScanState("requesting");

    // Explicitly check permission first
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      stream.getTracks().forEach(t => t.stop());
    } catch (err) {
      setScanError(getMediaError(err));
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
            handleScannedValue(result.getText());
          }
        }
      );
      controlsRef.current = controls;
    } catch (err) {
      setScanError(getMediaError(err));
      setScanState("error");
    }
  }, [handleScannedValue]);

  // Auto-start when component mounts
  useEffect(() => {
    if (!liffReady) return; // wait until we know if we're in LIFF
    if (canUseLiffScanner) {
      startLiffScan();
    } else {
      startCameraScan();
    }
    return () => stopCameraScanner();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liffReady]);

  const handleRetry = () => {
    scannedRef.current = false;
    setScanError(null);
    if (canUseLiffScanner) {
      startLiffScan();
    } else {
      startCameraScan();
    }
  };

  const handleClose = () => {
    stopCameraScanner();
    setLocation("/");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" data-testid="scan-page">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 h-16 flex items-center justify-between px-4 bg-gradient-to-b from-black/80 to-transparent">
        <h2 className="font-bold text-white">QRスキャン</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          className="text-white hover:bg-white/20 rounded-full"
          data-testid="button-scan-close"
        >
          <X className="w-6 h-6" />
        </Button>
      </div>

      <div className="flex-1 relative flex items-center justify-center bg-zinc-900">

        {/* Camera video feed */}
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            scanState === "scanning" ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          playsInline
          muted
          data-testid="video-scanner"
        />

        {/* Viewfinder overlay (camera mode) */}
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

        {/* LIFF native scanner: waiting state */}
        {(scanState === "idle" || scanState === "liff-scanning") && canUseLiffScanner && (
          <div className="flex flex-col items-center gap-6 px-8 text-center">
            <div className="w-24 h-24 bg-primary/20 rounded-full flex items-center justify-center">
              <QrCode className="w-12 h-12 text-primary" />
            </div>
            <div className="space-y-2">
              <p className="text-white font-bold text-lg">LINEのQRスキャナーが開きます</p>
              <p className="text-white/60 text-sm">スポットのQRコードを読み取ってください</p>
            </div>
            {scanState === "idle" && (
              <Button
                className="h-14 px-8 text-lg font-bold rounded-full"
                onClick={startLiffScan}
                data-testid="button-start-liff-scan"
              >
                <QrCode className="w-5 h-5 mr-2" />
                QRコードを読み取る
              </Button>
            )}
            {scanState === "liff-scanning" && (
              <div className="flex items-center gap-2 text-white/80">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">スキャナーを起動中...</span>
              </div>
            )}
          </div>
        )}

        {/* Loading / requesting camera */}
        {(scanState === "requesting" || (scanState === "idle" && !canUseLiffScanner)) && (
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

        {/* Error states */}
        {scanState === "error" && scanError && (
          <div className="p-6 w-full max-w-sm mx-auto" data-testid="scan-error">
            <div className="bg-white rounded-2xl p-6 text-center shadow-xl space-y-4">

              {/* Permission denied */}
              {scanError.kind === "permission-denied" && (
                <>
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                    <Camera className="w-8 h-8 text-red-500" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900">カメラの許可が必要です</h3>
                  {isIOS() ? (
                    <div className="bg-gray-50 rounded-xl p-4 text-left text-sm text-gray-700 space-y-1">
                      <p className="font-semibold">iOSでの許可手順：</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>iPhoneの「設定」を開く</li>
                        <li>「LINE」をタップ</li>
                        <li>「カメラ」を<strong>オン</strong>にする</li>
                        <li>LINEに戻って再試行</li>
                      </ol>
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-xl p-4 text-left text-sm text-gray-700 space-y-1">
                      <p className="font-semibold">許可手順：</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>ブラウザのアドレスバー横の 🔒 をタップ</li>
                        <li>「カメラ」を「許可」に変更</li>
                        <li>ページを再読み込み</li>
                      </ol>
                    </div>
                  )}
                </>
              )}

              {/* No camera found */}
              {scanError.kind === "no-camera" && (
                <>
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                    <Camera className="w-8 h-8 text-red-500" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900">カメラが見つかりません</h3>
                  <p className="text-sm text-gray-600">
                    端末にカメラが接続されていないか、他のアプリが使用中です。
                  </p>
                </>
              )}

              {/* LIFF scanCodeV2 not enabled */}
              {scanError.kind === "liff-no-feature" && (
                <>
                  <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
                    <QrCode className="w-8 h-8 text-amber-500" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900">QRスキャン機能が未設定です</h3>
                  <div className="bg-gray-50 rounded-xl p-4 text-left text-sm text-gray-700 space-y-1">
                    <p className="font-semibold">LINE Developer Consoleでの設定：</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>LIFFアプリの設定を開く</li>
                      <li>「Scan QR」を<strong>ON</strong>にする</li>
                      <li>アプリを再起動して再試行</li>
                    </ol>
                  </div>
                </>
              )}

              {/* Stamp apply error */}
              {scanError.kind === "stamp" && (
                <>
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                    <QrCode className="w-8 h-8 text-red-500" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900">スタンプを取得できませんでした</h3>
                  <p className="text-sm text-gray-600">{scanError.message}</p>
                </>
              )}

              {/* Unknown error */}
              {scanError.kind === "unknown" && (
                <>
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                    <Camera className="w-8 h-8 text-red-500" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900">エラーが発生しました</h3>
                  <p className="text-sm text-gray-600">{scanError.message}</p>
                </>
              )}

              <div className="flex flex-col gap-2 pt-2">
                {scanError.kind !== "liff-no-feature" && (
                  <Button
                    className="w-full h-12 font-bold rounded-full"
                    onClick={handleRetry}
                    data-testid="button-retry-scan"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    再試行する
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full h-12 font-bold rounded-full"
                  onClick={handleClose}
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
