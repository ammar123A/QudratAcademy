/**
 * Seeder — BACKEND_PLAN.md §11.
 *
 * Mirrors the front end's `src/data/seed.js` FIELD FOR FIELD AND ID FOR ID, so
 * after `npm run db:seed` the API returns the same objects the SPA has been
 * showing from localStorage. Demo passwords are hashed but unchanged:
 * admin123 / student123.
 *
 * Idempotent: wipes the tables below (children first) then re-inserts.
 *
 * Keep this in sync with the front-end mock seed until the SPA is fully
 * API-backed and the mock can be deleted.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const iso = (d) => new Date(d);
const hash = (pw) => bcrypt.hashSync(pw, 10);

async function main() {
  // Order matters: clear children -> parents
  await prisma.$transaction([
    prisma.quizAttempt.deleteMany(),
    prisma.submission.deleteMany(),
    prisma.attendanceSession.deleteMany(),
    prisma.grade.deleteMany(),
    prisma.material.deleteMany(),
    prisma.quiz.deleteMany(),
    prisma.assignment.deleteMany(),
    prisma.enrollment.deleteMany(),
    prisma.course.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  // ── Users ────────────────────────────────────────────
  await prisma.user.createMany({
    data: [
      { id: "u-admin",   role: "admin",   name: "Dr. Farah Idris",        email: "admin@qudrat.edu", passwordHash: hash("admin123"), title: "Academic Coordinator", avatarColor: "#B0591D" },
      { id: "u-instr-1", role: "admin",   name: "Nurse Educator Lim Wei", email: "lim@qudrat.edu",   passwordHash: hash("admin123"), title: "Clinical Instructor",  avatarColor: "#8A4518" },
      { id: "s-1001", role: "student", name: "Aisyah Rahman",  email: "aisyah@student.qudrat.edu", passwordHash: hash("student123"), matric: "QN-2024-1001", cohort: "Diploma in Nursing — Jan 2024", phone: "+60 12-334 5566", status: "active",   avatarColor: "#2563EB" },
      { id: "s-1002", role: "student", name: "Daniel Tan",     email: "daniel@student.qudrat.edu", passwordHash: hash("student123"), matric: "QN-2024-1002", cohort: "Diploma in Nursing — Jan 2024", phone: "+60 13-889 1200", status: "active",   avatarColor: "#0D9488" },
      { id: "s-1003", role: "student", name: "Priya Nair",     email: "priya@student.qudrat.edu",  passwordHash: hash("student123"), matric: "QN-2024-1003", cohort: "Diploma in Nursing — Jan 2024", phone: "+60 17-220 8841", status: "active",   avatarColor: "#7C3AED" },
      { id: "s-1004", role: "student", name: "Muhammad Haziq", email: "haziq@student.qudrat.edu",  passwordHash: hash("student123"), matric: "QN-2024-1004", cohort: "Diploma in Nursing — Jan 2024", phone: "+60 19-450 7723", status: "inactive", avatarColor: "#DC2626" },
    ],
  });

  // ── Courses ──────────────────────────────────────────
  await prisma.course.createMany({
    data: [
      { id: "c-anat",  code: "NUR 101", title: "Anatomy & Physiology I",  description: "Structure and function of the human body across major systems, with emphasis on clinical relevance for nursing practice.", instructorId: "u-admin",   credits: 4, schedule: "Mon & Wed, 09:00–10:30", room: "Block A — Lab 2",     term: "Semester 1, 2024", status: "published", createdAt: iso("2024-01-05") },
      { id: "c-fund",  code: "NUR 110", title: "Fundamentals of Nursing", description: "Core nursing concepts: patient safety, hygiene, vital signs, documentation, and the nursing process.",                    instructorId: "u-instr-1", credits: 3, schedule: "Tue & Thu, 11:00–12:30", room: "Block B — Skills Lab", term: "Semester 1, 2024", status: "published", createdAt: iso("2024-01-05") },
      { id: "c-pharm", code: "NUR 205", title: "Pharmacology for Nurses", description: "Drug classifications, safe medication administration, dosage calculation, and monitoring for adverse effects.",           instructorId: "u-admin",   credits: 3, schedule: "Fri, 09:00–12:00",       room: "Block A — Room 114",  term: "Semester 2, 2024", status: "draft",     createdAt: iso("2024-02-10") },
    ],
  });

  // ── Enrolments ───────────────────────────────────────
  await prisma.enrollment.createMany({
    data: [
      { id: "e-1", courseId: "c-anat", studentId: "s-1001", status: "enrolled", enrolledAt: iso("2024-01-08") },
      { id: "e-2", courseId: "c-anat", studentId: "s-1002", status: "enrolled", enrolledAt: iso("2024-01-08") },
      { id: "e-3", courseId: "c-anat", studentId: "s-1003", status: "enrolled", enrolledAt: iso("2024-01-09") },
      { id: "e-4", courseId: "c-fund", studentId: "s-1001", status: "enrolled", enrolledAt: iso("2024-01-08") },
      { id: "e-5", courseId: "c-fund", studentId: "s-1002", status: "enrolled", enrolledAt: iso("2024-01-10") },
    ],
  });

  // ── Materials (one of every viewer type) ─────────────
  await prisma.material.createMany({
    data: [
      { id: "m-1", courseId: "c-anat", week: 1, title: "Introduction to Anatomical Terminology", type: "reading", url: "https://en.wikipedia.org/wiki/Anatomical_terminology", description: "Planes, directional terms and body cavities. Read before the first lab.", createdAt: iso("2024-01-06") },
      { id: "m-2", courseId: "c-anat", week: 1, title: "Course Orientation — Lecture Slides", type: "slides", url: "https://pdfobject.com/pdf/sample.pdf", description: "How the course runs, assessment weighting and the lab schedule.", createdAt: iso("2024-01-06") },
      { id: "m-3", courseId: "c-anat", week: 2, title: "Introduction to Anatomy & Physiology (Lecture Recording)", type: "video", url: "https://www.youtube.com/watch?v=uBGl2BujkPQ", description: "Levels of organisation, homeostasis and the anatomical position.", createdAt: iso("2024-01-13") },
      { id: "m-4", courseId: "c-anat", week: 2, title: "The Cardiovascular System — Handout", type: "pdf", url: "https://www.orimi.com/pdf-test.pdf", description: "Heart chambers, valves, the conduction pathway and the cardiac cycle.", createdAt: iso("2024-01-15") },
      { id: "m-5", courseId: "c-anat", week: 3, title: "Anatomical Planes & Directional References", type: "image", url: "https://commons.wikimedia.org/wiki/Special:FilePath/Human_anatomy_planes,_labeled.jpg", description: "Reference diagram — sagittal, coronal and transverse planes.", createdAt: iso("2024-01-20") },
      { id: "m-6", courseId: "c-anat", week: 3, title: "Royal College of Nursing — Clinical Resources", type: "link", url: "https://www.rcn.org.uk/clinical-topics", description: "External reading for extra depth.", createdAt: iso("2024-01-20") },
      { id: "m-7", courseId: "c-fund", week: 1, title: "Measuring Vital Signs — Procedure Checklist", type: "pdf", url: "https://pdfobject.com/pdf/sample.pdf", description: "The checklist you will be assessed against in the skills lab.", createdAt: iso("2024-01-09") },
      { id: "m-8", courseId: "c-fund", week: 1, title: "Hand Hygiene Technique — Demonstration", type: "video", url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", description: "Watch before your first practical. (Sample video file.)", createdAt: iso("2024-01-10") },
      { id: "m-9", courseId: "c-fund", week: 2, title: "Bed-making & Patient Positioning (Demonstration)", type: "video", url: "https://vimeo.com/22439234", description: "You'll practise this in the Week 2 skills session.", createdAt: iso("2024-01-16") },
    ],
  });

  // ── Quizzes (questions as JSON) ──────────────────────
  await prisma.quiz.create({
    data: {
      id: "q-1", courseId: "c-anat", title: "Quiz 1 — Anatomical Terminology",
      description: "Ten minutes. Covers directional terms and body planes.",
      dueDate: iso("2024-01-20"), published: true,
      questions: [
        { id: "q1-a", text: "Which term describes a position toward the head?", options: ["Superior", "Inferior", "Distal", "Ventral"], correctIndex: 0, points: 2 },
        { id: "q1-b", text: "The midsagittal plane divides the body into:", options: ["Anterior and posterior halves", "Equal left and right halves", "Superior and inferior parts", "Proximal and distal parts"], correctIndex: 1, points: 2 },
        { id: "q1-c", text: "The wrist is ____ to the elbow.", options: ["Proximal", "Medial", "Distal", "Superior"], correctIndex: 2, points: 2 },
      ],
    },
  });
  await prisma.quiz.create({
    data: {
      id: "q-2", courseId: "c-fund", title: "Quiz 1 — Vital Signs",
      description: "Normal ranges for an adult patient.",
      dueDate: iso("2024-01-25"), published: true,
      questions: [
        { id: "q2-a", text: "A normal resting adult heart rate is:", options: ["40–60 bpm", "60–100 bpm", "100–120 bpm", "120–140 bpm"], correctIndex: 1, points: 3 },
        { id: "q2-b", text: "Which reading indicates a fever?", options: ["36.5 °C", "37.0 °C", "37.4 °C", "38.2 °C"], correctIndex: 3, points: 3 },
      ],
    },
  });

  await prisma.quizAttempt.create({
    data: { id: "qa-1", quizId: "q-1", studentId: "s-1002", answers: { "q1-a": 0, "q1-b": 1, "q1-c": 0 }, score: 4, maxScore: 6, submittedAt: iso("2024-01-19T14:12:00") },
  });

  // ── Assignments + submissions ───────────────────────
  await prisma.assignment.createMany({
    data: [
      { id: "a-1", courseId: "c-anat", title: "Case Study: Tracing Blood Flow", description: "Write a 1-page explanation tracing a drop of blood from the right atrium to the aorta, naming every structure and valve.", dueDate: iso("2024-02-02"), maxPoints: 20, published: true },
      { id: "a-2", courseId: "c-fund", title: "Reflective Journal — First Skills Lab", description: "Reflect on your first hands-on session recording vital signs. 400–600 words.", dueDate: iso("2024-01-30"), maxPoints: 15, published: true },
    ],
  });
  await prisma.submission.createMany({
    data: [
      { id: "sub-1", assignmentId: "a-1", studentId: "s-1001", note: "Attached my case study. I included a diagram of the conduction pathway.", fileName: "aisyah-blood-flow.pdf", submittedAt: iso("2024-01-31T22:05:00"), status: "graded", grade: 18, feedback: "Excellent detail on the valves. Watch the spelling of 'tricuspid'.", gradedAt: iso("2024-02-03") },
      { id: "sub-2", assignmentId: "a-1", studentId: "s-1002", note: "Submitting a little early.", fileName: "daniel-blood-flow.docx", submittedAt: iso("2024-02-01T09:30:00"), status: "submitted" },
    ],
  });

  // ── Attendance (records as JSON) ────────────────────
  await prisma.attendanceSession.createMany({
    data: [
      { id: "att-1", courseId: "c-anat", date: iso("2024-01-08"), topic: "Orientation & anatomical terminology", records: { "s-1001": "present", "s-1002": "present", "s-1003": "late" } },
      { id: "att-2", courseId: "c-anat", date: iso("2024-01-10"), topic: "Body cavities and membranes",           records: { "s-1001": "present", "s-1002": "absent",  "s-1003": "present" } },
      { id: "att-3", courseId: "c-fund", date: iso("2024-01-09"), topic: "Introduction to the nursing process",   records: { "s-1001": "present", "s-1002": "present" } },
    ],
  });

  // ── Manual gradebook (marks / scoring) ──────────────
  await prisma.grade.createMany({
    data: [
      { id: "g-1", courseId: "c-anat", studentId: "s-1001", item: "Lab Practical 1", category: "Practical", score: 42, maxScore: 50, weight: 15, recordedAt: iso("2024-01-28") },
      { id: "g-2", courseId: "c-anat", studentId: "s-1002", item: "Lab Practical 1", category: "Practical", score: 37, maxScore: 50, weight: 15, recordedAt: iso("2024-01-28") },
      { id: "g-3", courseId: "c-fund", studentId: "s-1001", item: "Vital Signs Skills Check", category: "Practical", score: 9, maxScore: 10, weight: 10, recordedAt: iso("2024-01-22"), note: "Confident technique." },
    ],
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
