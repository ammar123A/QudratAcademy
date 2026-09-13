/**
 * The grade formula — BACKEND_PLAN.md §7.
 *
 * This MUST stay identical to the front end's `src/lib/selectors.js`
 * (`courseGradeForStudent`, `letterGrade`) or numbers shift during integration.
 *
 * A "component" is one graded thing contributing to a course grade:
 *   1. manual gradebook entries  -> use their own `weight`
 *   2. graded assignment submissions -> fixed weight 10
 *   3. quiz attempts -> fixed weight 5
 *
 * Overall = weighted mean of component percentages, rounded.
 */

export const ASSIGNMENT_WEIGHT = 10;
export const QUIZ_WEIGHT = 5;

export const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);

export const letterGrade = (p) =>
  p == null ? "—" : p >= 80 ? "A" : p >= 70 ? "B" : p >= 60 ? "C" : p >= 50 ? "D" : "F";

export const gradePoint = (p) => (p >= 80 ? 4 : p >= 70 ? 3 : p >= 60 ? 2 : p >= 50 ? 1 : 0);

/**
 * @param {object} data
 * @param {Array} data.grades       manual Grade rows for this course+student
 * @param {Array} data.assignments  Assignment rows for this course
 * @param {Array} data.submissions  Submission rows for this student
 * @param {Array} data.quizzes      Quiz rows for this course
 * @param {Array} data.attempts     QuizAttempt rows for this student
 * @returns {{ parts: Array, totalWeight: number, overall: number|null }}
 */
export function courseGrade({
  grades = [],
  assignments = [],
  submissions = [],
  quizzes = [],
  attempts = [],
}) {
  const parts = [];

  // 1. manual gradebook entries — their own weight
  for (const g of grades) {
    parts.push({
      label: g.item,
      category: g.category ?? "Coursework",
      weight: g.weight || 0,
      score: g.score,
      maxScore: g.maxScore,
      percent: pct(g.score, g.maxScore),
    });
  }

  // 2. graded assignment submissions — fixed weight 10
  for (const a of assignments) {
    const s = submissions.find((x) => x.assignmentId === a.id);
    if (s && s.status === "graded" && s.grade != null) {
      parts.push({
        label: a.title,
        category: "Assignment",
        weight: ASSIGNMENT_WEIGHT,
        score: s.grade,
        maxScore: a.maxPoints,
        percent: pct(s.grade, a.maxPoints),
      });
    }
  }

  // 3. quiz attempts — fixed weight 5
  for (const q of quizzes) {
    const r = attempts.find((x) => x.quizId === q.id);
    if (r) {
      parts.push({
        label: q.title,
        category: "Quiz",
        weight: QUIZ_WEIGHT,
        score: r.score,
        maxScore: r.maxScore,
        percent: pct(r.score, r.maxScore),
      });
    }
  }

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const overall = totalWeight
    ? Math.round(parts.reduce((s, p) => s + p.percent * p.weight, 0) / totalWeight)
    : null;

  return { parts, totalWeight, overall };
}

/**
 * Attendance rate — matches the front end's `attendanceSummary`.
 * A student counts as present for "present", "late" or "excused".
 * rate = present / recorded (sessions where the student has any record).
 */
export const PRESENT_STATUSES = new Set(["present", "late", "excused"]);

export function attendanceSummary(sessions, studentId) {
  let present = 0;
  let total = 0;
  const detail = [];
  for (const s of sessions) {
    const status = (s.records ?? {})[studentId];
    if (status) {
      total += 1;
      if (PRESENT_STATUSES.has(status)) present += 1;
    }
    detail.push({ id: s.id, date: s.date, topic: s.topic, status: status ?? null });
  }
  return {
    rate: total ? Math.round((present / total) * 100) : null,
    present,
    total,
    sessions: detail,
  };
}

/** GPA = Σ(gradePoint · credits) / Σ credits, over courses with a non-null overall. */
export function gpaFor(courses) {
  const graded = courses.filter((c) => c.overall != null);
  const credits = graded.reduce((s, c) => s + (c.credits || 0), 0);
  if (!credits) return null;
  const points = graded.reduce((s, c) => s + gradePoint(c.overall) * (c.credits || 0), 0);
  return Math.round((points / credits) * 100) / 100;
}
