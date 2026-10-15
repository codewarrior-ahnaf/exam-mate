"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function WebsiteLoader() {
  const pathname = usePathname();
  const [shouldShow, setShouldShow] = useState(false);
  const [mounted, setMounted] = useState(true);
  const [fadingOut, setFadingOut] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Only show on homepage, never on /privacy, /terms, etc.
    if (pathname !== "/") {
      if (typeof document !== "undefined") {
        document.documentElement.classList.remove("app-loading");
      }
      setMounted(false);
      return;
    }

    // 1. Detect if the user refreshed / reloaded the page
    const navEntries =
      typeof performance !== "undefined"
        ? performance.getEntriesByType("navigation")
        : [];
    const navTiming = navEntries[0] as PerformanceNavigationTiming | undefined;
    const isReload =
      navTiming?.type === "reload" ||
      (typeof window !== "undefined" &&
        (window.performance as unknown as { navigation?: { type?: number } })
          ?.navigation?.type === 1);

    // 2. Detect if user has a slow network / slow Wi-Fi
    const nav = typeof navigator !== "undefined" ? navigator : null;
    const conn =
      nav &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((nav as any).connection ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (nav as any).mozConnection ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (nav as any).webkitConnection);

    const effectiveType: string = conn?.effectiveType || "4g";
    const downlink: number =
      typeof conn?.downlink === "number" ? conn.downlink : 10;
    const rtt: number = typeof conn?.rtt === "number" ? conn.rtt : 50;
    const saveData: boolean = Boolean(conn?.saveData);

    const isSlowConnection =
      saveData ||
      effectiveType === "2g" ||
      effectiveType === "slow-2g" ||
      effectiveType === "3g" ||
      downlink < 1.8 ||
      rtt > 220;

    let dismissTimeout: ReturnType<typeof setTimeout> | null = null;
    let unmountTimeout: ReturnType<typeof setTimeout> | null = null;
    let animationFrameId: number | null = null;
    let fallbackCheckTimer: ReturnType<typeof setTimeout> | null = null;
    let isComplete = false;

    const startLoaderAnimation = () => {
      setShouldShow(true);

      const isUltraFast = (downlink >= 8 || effectiveType === "4g") && rtt < 80;
      const rateMultiplier = isUltraFast
        ? 1.8
        : isSlowConnection
          ? 0.5
          : 1.2;

      let currentVal = 0;
      let targetCeiling = 35;
      let observer: PerformanceObserver | null = null;
      let loadedResources = 0;

      if (typeof PerformanceObserver !== "undefined") {
        try {
          observer = new PerformanceObserver((list) => {
            loadedResources += list.getEntries().length;
            targetCeiling = Math.min(
              95,
              Math.max(targetCeiling, 35 + loadedResources * 7),
            );
          });
          observer.observe({ type: "resource", buffered: true });
        } catch {
          // ignore
        }
      }

      const completeAndDismiss = () => {
        if (isComplete) return;
        isComplete = true;
        if (observer) {
          try {
            observer.disconnect();
          } catch {
            // ignore
          }
        }

        const finishStep = () => {
          currentVal += Math.max(4, (100 - currentVal) * 0.4);
          if (currentVal >= 99.5) {
            currentVal = 100;
            setProgress(100);

            dismissTimeout = setTimeout(() => {
              setFadingOut(true);
              if (typeof document !== "undefined") {
                document.documentElement.classList.remove("app-loading");
              }
              unmountTimeout = setTimeout(() => {
                setMounted(false);
              }, 400);
            }, 120);
          } else {
            setProgress(Math.round(currentVal));
            animationFrameId = requestAnimationFrame(finishStep);
          }
        };

        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        animationFrameId = requestAnimationFrame(finishStep);
      };

      if (typeof document !== "undefined" && document.readyState === "complete") {
        targetCeiling = 100;
        completeAndDismiss();
      }

      const onDomReady = () => {
        targetCeiling = Math.max(targetCeiling, 85);
      };

      const onLoad = () => {
        targetCeiling = 100;
        completeAndDismiss();
      };

      if (typeof document !== "undefined") {
        document.addEventListener("DOMContentLoaded", onDomReady);
      }
      if (typeof window !== "undefined") {
        window.addEventListener("load", onLoad);
      }

      let lastTime = performance.now();

      const loop = (now: number) => {
        if (isComplete) return;

        const delta = (now - lastTime) / 16.6;
        lastTime = now;

        if (typeof document !== "undefined") {
          if (document.readyState === "complete") {
            completeAndDismiss();
            return;
          } else if (document.readyState === "interactive") {
            targetCeiling = Math.max(targetCeiling, 85);
          }
        }

        if (currentVal < targetCeiling) {
          const remaining = targetCeiling - currentVal;
          const step = Math.max(0.2, remaining * 0.08) * rateMultiplier * delta;
          currentVal = Math.min(targetCeiling, currentVal + step);
          setProgress(Math.round(currentVal));
        }

        animationFrameId = requestAnimationFrame(loop);
      };

      animationFrameId = requestAnimationFrame(loop);

      const failsafe = setTimeout(
        () => {
          if (!isComplete) {
            completeAndDismiss();
          }
        },
        isSlowConnection ? 4500 : 3000,
      );

      return () => {
        if (typeof document !== "undefined") {
          document.removeEventListener("DOMContentLoaded", onDomReady);
        }
        if (typeof window !== "undefined") {
          window.removeEventListener("load", onLoad);
        }
        if (observer) {
          try {
            observer.disconnect();
          } catch {
            // ignore
          }
        }
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        clearTimeout(failsafe);
        if (dismissTimeout) clearTimeout(dismissTimeout);
        if (unmountTimeout) clearTimeout(unmountTimeout);
      };
    };

    let cleanupFn: (() => void) | undefined;

    if (isReload || isSlowConnection) {
      cleanupFn = startLoaderAnimation();
    } else {
      if (typeof document !== "undefined" && document.readyState === "complete") {
        if (typeof document !== "undefined") {
          document.documentElement.classList.remove("app-loading");
        }
        setMounted(false);
      } else {
        fallbackCheckTimer = setTimeout(() => {
          if (
            typeof document !== "undefined" &&
            document.readyState !== "complete"
          ) {
            cleanupFn = startLoaderAnimation();
          } else {
            if (typeof document !== "undefined") {
              document.documentElement.classList.remove("app-loading");
            }
            setMounted(false);
          }
        }, 180);
      }
    }

    return () => {
      if (typeof document !== "undefined") {
        document.documentElement.classList.remove("app-loading");
      }
      if (fallbackCheckTimer) clearTimeout(fallbackCheckTimer);
      if (cleanupFn) cleanupFn();
    };
  }, [pathname]);

  if (!mounted) return null;

  const isFull = progress >= 100;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading ExamMate"
      className={`fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#070D12] text-white select-none overflow-hidden transition-all duration-400 ease-out app-loader-overlay ${
        fadingOut
          ? "opacity-0 scale-[1.02] pointer-events-none"
          : shouldShow
            ? "opacity-100 scale-100 pointer-events-auto"
            : ""
      }`}
    >
      {/* Subtle modern radial ambient light */}
      <div className="pointer-events-none absolute h-[380px] w-[380px] -translate-y-6 rounded-full bg-teal-500/[0.08] blur-[100px]" />

      <div className="relative z-10 flex flex-col items-center text-center px-4 max-w-sm">
        {/* Floating Glass Emblem with breathing glow */}
        <div className="relative mb-5 flex items-center justify-center">
          <div className="absolute -inset-2.5 rounded-3xl bg-teal-400/20 blur-xl opacity-60 animate-pulse" />
          <div className="relative flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02] shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.15)] backdrop-blur-2xl">
            <img
              src="/icon.svg"
              alt="ExamMate Logo"
              width="44"
              height="44"
              className="h-9 w-9 sm:h-11 sm:w-11 drop-shadow-[0_0_16px_rgba(94,234,212,0.65)]"
            />
          </div>
        </div>

        {/* Clean, Modern Brand Title */}
        <h1 className="text-2xl font-bold tracking-tight text-white font-sans">
          Exam<span className="text-[#5EEAD4]">Mate</span>
        </h1>

        {/* Minimal, Sleek Progress Bar (Linear / Vercel style) */}
        <div className="mt-7 w-56 sm:w-64">
          <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-400 to-[#5EEAD4] shadow-[0_0_10px_rgba(94,234,212,0.7)] transition-[width] duration-150 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Understated Status & Percentage */}
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
            <span className="font-normal text-slate-400 text-[11px] sm:text-xs">
              {isFull ? "Ready" : "Loading workspace..."}
            </span>
            <span className="font-mono tabular-nums text-[11px] sm:text-xs font-semibold text-teal-300">
              {progress}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
