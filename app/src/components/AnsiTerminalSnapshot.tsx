import { useMemo } from "react";
import AnsiToHtml from "ansi-to-html";

interface AnsiTerminalSnapshotProps {
  snapshot: string;
}

export function AnsiTerminalSnapshot(props: AnsiTerminalSnapshotProps) {
  const html = useMemo(() => {
    if (!props.snapshot) {
      return "&nbsp;";
    }

    const converter = new AnsiToHtml({
      fg: "#e6edf2",
      bg: "#071014",
      newline: true,
      escapeXML: true,
      stream: false,
    });

    return converter.toHtml(props.snapshot);
  }, [props.snapshot]);

  return <pre className="tp-ansi-snapshot" dangerouslySetInnerHTML={{ __html: html }} />;
}
