export type AssessmentCategory = "knowledge" | "thinking" | "learning_quality";

export const CATEGORY_TIMESTAMP_COLUMN: Record<
  AssessmentCategory,
  "knowledge_updated_at" | "thinking_updated_at" | "learning_quality_updated_at"
> = {
  knowledge: "knowledge_updated_at",
  thinking: "thinking_updated_at",
  learning_quality: "learning_quality_updated_at",
};

export type AssessmentTimestamps = Record<AssessmentCategory, string | null>;

const storageKey = (studentId: string, category: AssessmentCategory) =>
  `assessment_viewed:${studentId}:${category}`;

export function getViewedAt(studentId: string, category: AssessmentCategory): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(storageKey(studentId, category));
  } catch {
    return null;
  }
}

export function markViewed(studentId: string, category: AssessmentCategory, at: string | null) {
  if (typeof window === "undefined" || !at) return;
  try {
    window.localStorage.setItem(storageKey(studentId, category), at);
  } catch {
    /* noop */
  }
}

export function isUnread(
  studentId: string,
  category: AssessmentCategory,
  updatedAt: string | null,
): boolean {
  if (!updatedAt) return false;
  const viewed = getViewedAt(studentId, category);
  if (!viewed) return true;
  return new Date(updatedAt).getTime() > new Date(viewed).getTime();
}
