import { memo, useDeferredValue, useEffect, useMemo, useRef } from "react";
import AnsiToHtml from "ansi-to-html";

interface AnsiTerminalSnapshotProps {
  snapshot: string;
}

const converter = new AnsiToHtml({
  fg: "#e6edf2",
  bg: "#071014",
  newline: true,
  escapeXML: true,
  stream: false,
});

export const AnsiTerminalSnapshot = memo(function AnsiTerminalSnapshot(props: AnsiTerminalSnapshotProps) {
  const deferredSnapshot = useDeferredValue(props.snapshot);
  const preRef = useRef<HTMLPreElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const html = useMemo(() => {
    if (!deferredSnapshot) {
      return "&nbsp;";
    }

    return converter.toHtml(deferredSnapshot);
  }, [deferredSnapshot]);

  useEffect(() => {
    const scroller = preRef.current?.parentElement;
    if (!scroller) {
      return;
    }

    const handleScroll = () => {
      const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      shouldStickToBottomRef.current = distanceFromBottom < 48;
    };

    handleScroll();
    scroller.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    const scroller = preRef.current?.parentElement;
    if (!scroller || !shouldStickToBottomRef.current) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      scroller.scrollTop = scroller.scrollHeight;
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [html]);

  return <pre ref={preRef} className="tp-ansi-snapshot" dangerouslySetInnerHTML={{ __html: html }} />;
});
