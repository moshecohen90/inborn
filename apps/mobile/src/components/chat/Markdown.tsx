import { memo, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type TextStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { directionOf, inlineToText, parseMarkdown, type Block, type Inline } from "@inborn/core";
import { radius } from "@inborn/ui";
import { useTheme } from "../../lib/theme";
import { copyText } from "../../lib/clipboard";
import { useType } from "../../services/type";
import { font } from "../../services/type";

interface MarkdownProps {
  source: string;
  /** Direction of the whole answer (first strong character); tables and code stay LTR inside RTL (§7.8). */
  direction?: "ltr" | "rtl";
  /** Appended after the last text run while streaming. */
  caret?: boolean;
  testID?: string;
}

/**
 * Native-text Markdown (§7.1). Links are text and never open; nothing here can start a request.
 * Parsing is cheap enough to run per token; each block re-renders only when its own source changes.
 */
export const Markdown = memo(function Markdown({ source, direction, caret, testID }: MarkdownProps) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  const dir = direction ?? directionOf(source);
  return (
    <View testID={testID} style={styles.root}>
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} dir={dir} caret={caret && i === blocks.length - 1} />
      ))}
      {caret && !blocks.length ? <Caret /> : null}
    </View>
  );
});

export function Caret() {
  const theme = useTheme();
  return (
    <Text testID="caret" style={{ color: theme.accent }}>
      ▍
    </Text>
  );
}

function BlockView({ block, dir, caret }: { block: Block; dir: "ltr" | "rtl"; caret?: boolean }) {
  const type = useType();
  const theme = useTheme();
  const textDir: TextStyle = { writingDirection: dir, textAlign: dir === "rtl" ? "right" : "left" };
  switch (block.type) {
    case "paragraph":
      return (
        <Text style={[type.body, textDir, { color: theme.text }]} selectable>
          <Inlines nodes={block.children} />
          {caret ? <Caret /> : null}
        </Text>
      );
    case "heading": {
      const size = block.level === 1 ? 22 : block.level === 2 ? 19 : 17;
      return (
        <Text style={[type.heading, textDir, { color: theme.text, fontSize: size, lineHeight: size + 7, marginTop: 6 }]} accessibilityRole="header" selectable>
          <Inlines nodes={block.children} />
          {caret ? <Caret /> : null}
        </Text>
      );
    }
    case "code":
      return <CodeBlock lang={block.lang} text={block.text} open={block.open} caret={caret} />;
    case "math":
      return (
        <View style={[styles.math, { backgroundColor: theme.well, borderColor: theme.border }]} accessibilityLabel={block.text}>
          <Text style={[type.mono, { color: theme.text, fontSize: 14, lineHeight: 20 }]} selectable>
            {block.text}
          </Text>
        </View>
      );
    case "hr":
      return <View style={[styles.hr, { backgroundColor: theme.border }]} />;
    case "quote":
      return (
        <View style={[styles.quote, { borderColor: theme.accent }, dir === "rtl" ? styles.quoteRtl : null]}>
          {block.children.map((b, i) => (
            <BlockView key={i} block={b} dir={dir} caret={caret && i === block.children.length - 1} />
          ))}
        </View>
      );
    case "list":
      return (
        <View style={styles.list} accessibilityRole="list">
          {block.items.map((item, i) => (
            <View key={i} style={[styles.listItem, dir === "rtl" ? styles.listItemRtl : null]}>
              <Text style={[type.body, styles.bullet, { color: theme.text2 }]}>{block.ordered ? `${block.start + i}.` : "•"}</Text>
              <View style={styles.listBody}>
                {item.children.map((b, j) => (
                  <BlockView key={j} block={b} dir={dir} caret={caret && i === block.items.length - 1 && j === item.children.length - 1} />
                ))}
              </View>
            </View>
          ))}
        </View>
      );
    case "table":
      return <Table header={block.header} align={block.align} rows={block.rows} />;
  }
}

function Inlines({ nodes }: { nodes: Inline[] }) {
  const type = useType();
  const theme = useTheme();
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.type) {
          case "text":
            return n.text;
          case "br":
            return "\n";
          case "strong":
            return (
              <Text key={i} style={type.strong}>
                <Inlines nodes={n.children} />
              </Text>
            );
          case "em":
            return (
              <Text key={i} style={styles.em}>
                <Inlines nodes={n.children} />
              </Text>
            );
          case "strike":
            return (
              <Text key={i} style={styles.strike}>
                <Inlines nodes={n.children} />
              </Text>
            );
          case "code":
            return (
              <Text key={i} style={[styles.inlineCode, { backgroundColor: theme.well, color: theme.text }]}>
                {n.text}
              </Text>
            );
          case "math":
            return (
              <Text key={i} style={[styles.inlineCode, { color: theme.text }]}>
                {n.text}
              </Text>
            );
          case "link":
            // Text only (§5.1: no navigation, no fetch); the URL is visible so the user can copy it deliberately.
            return (
              <Text key={i} accessibilityLabel={inlineToText([n])}>
                <Text style={[styles.link, { color: theme.accent }]}>
                  <Inlines nodes={n.children} />
                </Text>
                <Text style={[type.mono, { color: theme.text3 }]}> ({n.url})</Text>
              </Text>
            );
        }
      })}
    </>
  );
}

export function CodeBlock({ lang, text, open, caret }: { lang: string; text: string; open: boolean; caret?: boolean }) {
  const type = useType();
  const theme = useTheme();
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void copyText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  // Streaming rule (§9.6): until the closing fence arrives the block is plain text, then it becomes code in one step.
  if (open) {
    return (
      <Text style={[type.body, { color: theme.text }]} selectable>
        {lang ? `\`\`\`${lang}\n` : "```\n"}
        {text}
        {caret ? <Caret /> : null}
      </Text>
    );
  }
  return (
    <View testID="code-block" style={[styles.code, { backgroundColor: theme.well, borderColor: theme.border }]}>
      <View style={[styles.codeHeader, { borderBottomColor: theme.border }]}>
        <Text style={[type.monoLabel, { color: theme.text3 }]}>{lang || "code"}</Text>
        <Pressable testID="copy-code" accessibilityRole="button" accessibilityLabel={t("chat.copy")} onPress={copy} hitSlop={8} style={styles.copyBtn}>
          <Text style={[type.monoLabel, { color: copied ? theme.sealed : theme.text2 }]}>{copied ? t("chat.copied") : t("chat.copy")}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.codeScroll}>
        <Text style={[styles.codeText, { color: theme.text }]} selectable>
          {text}
        </Text>
      </ScrollView>
    </View>
  );
}

function Table({ header, align, rows }: { header: Inline[][]; align: ("left" | "center" | "right" | null)[]; rows: Inline[][][] }) {
  const type = useType();
  const theme = useTheme();
  const widths = useMemo(() => header.map((_, c) => Math.min(240, Math.max(72, 8 * Math.max(inlineToText(header[c] ?? []).length, ...rows.map((r) => inlineToText(r[c] ?? []).length)) + 24))), [header, rows]);
  const cellStyle = (c: number): TextStyle => ({ width: widths[c], textAlign: align[c] ?? "left", writingDirection: "ltr" });
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="table" style={styles.tableScroll}>
      <View style={[styles.table, { borderColor: theme.border }]}>
        <View style={[styles.tr, { backgroundColor: theme.surface2, borderBottomColor: theme.border }]}>
          {header.map((cell, c) => (
            <Text key={c} style={[type.bodySmall, type.strong, styles.td, cellStyle(c), { color: theme.text }]}>
              <Inlines nodes={cell} />
            </Text>
          ))}
        </View>
        {rows.map((row, r) => (
          <View key={r} style={[styles.tr, { borderBottomColor: theme.border }, r === rows.length - 1 ? styles.trLast : null]}>
            {row.map((cell, c) => (
              <Text key={c} style={[type.bodySmall, styles.td, cellStyle(c), { color: theme.text }]} selectable>
                <Inlines nodes={cell} />
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  em: { fontStyle: "italic" },
  strike: { textDecorationLine: "line-through" },
  link: { textDecorationLine: "underline" },
  inlineCode: { ...font("mono"), fontSize: 14, borderRadius: 4, paddingHorizontal: 3 },
  code: { borderWidth: 1, borderRadius: radius.control, overflow: "hidden" },
  codeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, minHeight: 32, borderBottomWidth: StyleSheet.hairlineWidth },
  copyBtn: { minHeight: 32, justifyContent: "center" },
  codeScroll: { padding: 12 },
  codeText: { ...font("mono"), fontSize: 13, lineHeight: 19, writingDirection: "ltr" },
  math: { borderWidth: 1, borderRadius: radius.control, padding: 12, alignItems: "center" },
  hr: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  quote: { borderLeftWidth: 2, paddingLeft: 12, gap: 8 },
  quoteRtl: { borderLeftWidth: 0, borderRightWidth: 2, paddingLeft: 0, paddingRight: 12 },
  list: { gap: 4 },
  listItem: { flexDirection: "row", gap: 8 },
  listItemRtl: { flexDirection: "row-reverse" },
  bullet: { minWidth: 20, textAlign: "center" },
  listBody: { flex: 1, gap: 6 },
  tableScroll: { marginVertical: 2 },
  table: { borderWidth: 1, borderRadius: radius.control, overflow: "hidden" },
  tr: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  trLast: { borderBottomWidth: 0 },
  td: { paddingHorizontal: 10, paddingVertical: 8 },
});
