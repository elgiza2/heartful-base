import ThinkingTrace from "@/components/chat/ThinkingTrace";

/**
 * Kept as a thin alias so every reasoning surface renders the single unified
 * `ThinkingTrace` look (Megsy star + collapsible "Thinking" line).
 */
export function ReasoningPanel({
  text,
  streaming,
}: {
  text: string;
  streaming?: boolean;
}) {
  return <ThinkingTrace text={text} active={streaming} />;
}
