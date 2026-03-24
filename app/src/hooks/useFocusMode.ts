import { useCallback, useEffect, useRef, useState } from "react";

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape" | "portrait") => Promise<void>;
  unlock?: () => void;
};

interface UseFocusModeOptions {
  isDesktop: boolean;
  onNotice?: (kind: "info" | "success" | "error", text: string) => void;
}

interface FocusModeState {
  active: boolean;
  shellClassName: string | undefined;
  toggle: () => Promise<void>;
  reset: () => void;
}

function getScreenOrientation(): LockableScreenOrientation | undefined {
  return ("orientation" in screen ? screen.orientation : undefined) as LockableScreenOrientation | undefined;
}

export function useFocusMode(options: UseFocusModeOptions): FocusModeState {
  const { isDesktop, onNotice } = options;
  const [active, setActive] = useState(false);
  const intentRef = useRef(false);
  const onNoticeRef = useRef(onNotice);
  onNoticeRef.current = onNotice;

  const toggle = useCallback(async () => {
    const next = !intentRef.current;
    intentRef.current = next;
    setActive(next);

    if (typeof document === "undefined") {
      return;
    }

    if (next) {
      const target = document.documentElement;
      if (target.requestFullscreen) {
        try {
          await target.requestFullscreen();
        } catch {
          // Fullscreen denied — focus mode still works without it.
        }
      }
      const orientation = getScreenOrientation();
      if (orientation?.lock) {
        try {
          await orientation.lock("landscape");
        } catch {
          onNoticeRef.current?.("info", "已进入终端聚焦模式。若浏览器不支持自动横屏，请手动旋转手机。");
        }
      } else {
        onNoticeRef.current?.("info", "已进入终端聚焦模式。若想获得更宽终端，请手动旋转手机。");
      }
      return;
    }

    intentRef.current = false;

    if (document.fullscreenElement && document.exitFullscreen) {
      try {
        await document.exitFullscreen();
      } catch {
        // ignore exit errors
      }
    }
    const orientation = getScreenOrientation();
    if (orientation?.unlock) {
      try {
        orientation.unlock();
      } catch {
        // ignore unsupported unlock
      }
    }
  }, []);

  const reset = useCallback(() => {
    intentRef.current = false;
    setActive(false);
  }, []);

  useEffect(() => {
    if (active || typeof document === "undefined") {
      return;
    }
    intentRef.current = false;
    if (document.fullscreenElement && document.exitFullscreen) {
      void document.exitFullscreen().catch(() => undefined);
    }
    const orientation = getScreenOrientation();
    if (orientation?.unlock) {
      try {
        orientation.unlock();
      } catch {
        // ignore unsupported unlock
      }
    }
  }, [active]);

  useEffect(() => {
    if (typeof document === "undefined" || isDesktop) {
      return;
    }

    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousOverscroll = body.style.overscrollBehavior;

    if (active) {
      body.style.overflow = "hidden";
      body.style.overscrollBehavior = "none";
    }

    return () => {
      body.style.overflow = previousOverflow;
      body.style.overscrollBehavior = previousOverscroll;
    };
  }, [isDesktop, active]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && !intentRef.current) {
        setActive(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const shellClassName = active ? "tp-mobile-focus-shell tp-mobile-focus-shell-active" : undefined;

  return { active, shellClassName, toggle, reset };
}
