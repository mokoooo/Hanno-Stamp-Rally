import { useState, useEffect } from "react";

declare global {
  interface Window {
    liff: any;
  }
}

export function useLiff() {
  const [liff, setLiff] = useState<any | null>(null);
  const [liffError, setLiffError] = useState<string | null>(null);
  const liffId = import.meta.env.VITE_LIFF_ID;
  const [isInitialized, setIsInitialized] = useState(!liffId);

  useEffect(() => {
    if (!liffId) {
      setIsInitialized(true);
      return;
    }

    const loadLiffSdk = async () => {
      try {
        if (window.liff) {
          await initializeLiff(window.liff);
          return;
        }

        const script = document.createElement("script");
        script.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
        script.async = true;

        script.onload = async () => {
          if (window.liff) {
            await initializeLiff(window.liff);
          } else {
            setLiffError("LIFF SDK loaded but liff object not found");
            setIsInitialized(true);
          }
        };

        script.onerror = () => {
          setLiffError("Failed to load LIFF SDK");
          setIsInitialized(true);
        };

        document.head.appendChild(script);
      } catch (err) {
        setLiffError(err instanceof Error ? err.message : "Unknown error loading LIFF");
        setIsInitialized(true);
      }
    };

    const initializeLiff = async (liffObj: any) => {
      try {
        await liffObj.init({ liffId });
        setLiff(liffObj);
        setIsInitialized(true);
      } catch (err) {
        console.error("LIFF initialization failed", err);
        setLiffError(err instanceof Error ? err.message : "Failed to initialize LIFF");
        setIsInitialized(true);
      }
    };

    loadLiffSdk();
  }, [liffId]);

  return { liff, liffError, isInitialized };
}
