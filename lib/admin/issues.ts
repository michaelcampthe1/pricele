const LABELS: Record<string, string> = {
  answer_missing: "The answer amount is missing.",
  currency_invalid: "Currency must be USD.",
  answer_definition_missing: "Define exactly what amount is being asked for.",
  reference_date_missing: "Add a reference date or period.",
  explanation_missing: "Add an explanation.",
  category_missing: "Choose a category.",
  source_missing: "Attach at least one source.",
  date_in_past: "The game date is in the past.",
  date_conflict: "Another set is already scheduled for that date.",
  requires_three_questions: "Assign exactly three questions.",
  duplicate_question: "A question is assigned twice.",
  set_not_found: "Set not found.",
};

/** Human-readable label for a validation issue code from the database. */
export function describeIssue(code: string): string {
  if (LABELS[code]) return LABELS[code];
  const m = /^position_(\d)_(.+)$/.exec(code);
  if (m) {
    const what: Record<string, string> = {
      difficulty_mismatch: "has the wrong difficulty",
      not_approved: "isn't approved",
      unverified: "isn't verified",
      answer_invalid: "has no valid answer",
      source_missing: "has no source",
      incomplete: "is incomplete",
    };
    return `Question ${m[1]} ${what[m[2]] ?? m[2]}.`;
  }
  return code;
}
