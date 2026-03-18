import { memo, useDeferredValue, useMemo } from "react";
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
  const html = useMemo(() => {
    if (!deferredSnapshot) {
      return "&nbsp;";
    }

    return converter.toHtml(deferredSnapshot);
  }, [deferredSnapshot]);

  return <pre className="tp-ansi-snapshot" dangerouslySetInnerHTML={{ __html: html }} />;
});
