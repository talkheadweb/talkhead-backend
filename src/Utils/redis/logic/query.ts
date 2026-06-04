import { Condition } from "../types";

export const buildQuery = (conditions?: Condition[] | string): string => {
  if (!conditions || (Array.isArray(conditions) && conditions.length === 0)) return "*";
  if (typeof conditions === "string") return conditions.trim() || "*";
  const parts: string[] = [];
  for (const c of conditions) {
    if (c.type === "tag") {
      const vals = Array.isArray(c.value) ? c.value : [c.value];
      const escaped = vals.map(v => v.replace(/[^a-zA-Z0-9_\-:.]/g, "")).filter(Boolean);
      const segment = `@${c.field}:{${escaped.join("|")}}`;
      parts.push(segment);
    } else if (c.type === "text") {
      const vals = Array.isArray(c.value) ? c.value : [c.value];
      const tokens = vals.map(v => v.trim()).filter(Boolean).join(" ");
      const segment = `@${c.field}:("${tokens}")`;
      parts.push(segment);
    } else if (c.type === "numeric") {
      const [min, max] = c.range;
      const minStr = typeof min === "number" ? min.toString() : min;
      const maxStr = typeof max === "number" ? max.toString() : max;
      const segment = `@${c.field}:[${minStr} ${maxStr}]`;
      parts.push(segment);
    }
  }
  return parts.length ? parts.join(" ") : "*";
};

