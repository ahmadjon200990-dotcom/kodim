import bcrypt from "bcryptjs";
import { ExamInput } from "@exam-ide/shared";
import { env } from "./env.js";
import { prisma } from "./db.js";

// Namuna o'qituvchi faqat lokal sinov uchun (kirish ma'lumotlari hujjatlarda shu).
// Interfeysda "Demo" so'zi ko'rinmasin — ko'rinadigan nom va sarlavha oddiy.
const DEMO_TEACHER = { name: "Namuna o'qituvchi", email: "demo@kodim.uz", password: "demo12345" };
const DEMO_EXAM_TITLE = "JavaScript va Figma";
/** Eski seed nomi — qayta ishga tushirilganda u ham almashtiriladi. */
const OLD_DEMO_TITLES = ["Demo: JavaScript va Figma"];

async function upsertTeacher(name: string, email: string, password: string, role: "ADMIN" | "TEACHER") {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.teacher.upsert({
    where: { email },
    update: { name, passwordHash, role },
    create: { name, email, passwordHash, role },
  });
}

const demoExam = ExamInput.parse({
  title: DEMO_EXAM_TITLE,
  durationMin: 60,
  template: "HTML",
  aiEnabled: false,
  tasks: [
    {
      title: "Massivdagi juft sonlar yig'indisi",
      type: "EXERCISE",
      description: [
        "`script.js` faylida `sumEven(numbers)` funksiyasini yozing.",
        "Funksiya massivdagi **juft** sonlar yig'indisini qaytarsin.",
        "",
        "Natijani konsolga chiqaring: `console.log(sumEven([1, 2, 3, 4, 5, 6]))`.",
      ].join("\n"),
      expectedOutput: "12",
    },
    {
      title: "Profil kartasi",
      type: "FIGMA",
      description: "Figma dizayndagi profil kartasini `index.html` va `style.css` da semantik HTML bilan tayyorlang.",
      figmaUrl: "https://www.figma.com/design/demo/profile-card",
    },
  ],
  referenceFiles: [
    {
      path: "index.html",
      content: [
        "<!doctype html>",
        '<html lang="uz">',
        "<head>",
        '  <meta charset="UTF-8" />',
        '  <link rel="stylesheet" href="style.css" />',
        "  <title>Profil</title>",
        "</head>",
        "<body>",
        '  <article class="card">',
        '    <img class="card__avatar" src="avatar.png" alt="Ali Valiyev" />',
        "    <h1>Ali Valiyev</h1>",
        "    <p>Frontend dasturchi</p>",
        "  </article>",
        '  <script src="script.js"></script>',
        "</body>",
        "</html>",
        "",
      ].join("\n"),
    },
    {
      path: "style.css",
      content: [
        "body { display: grid; place-items: center; min-height: 100vh; margin: 0; font-family: sans-serif; }",
        ".card { padding: 24px; border-radius: 16px; box-shadow: 0 4px 16px rgb(0 0 0 / 0.1); text-align: center; }",
        ".card__avatar { width: 96px; height: 96px; border-radius: 50%; }",
        "",
      ].join("\n"),
    },
    {
      path: "script.js",
      content: [
        "function sumEven(numbers) {",
        "  return numbers.filter((n) => n % 2 === 0).reduce((sum, n) => sum + n, 0);",
        "}",
        "",
        "console.log(sumEven([1, 2, 3, 4, 5, 6]));",
        "",
      ].join("\n"),
    },
  ],
  criteria: [
    { name: "Semantik HTML", weight: 50, description: "To'g'ri teglar, tuzilma, alt matnlar" },
    { name: "CSS/joylashuv", weight: 30, description: "Dizaynga moslik, joylashuv" },
    { name: "Toza kod", weight: 20, description: "Nomlash, o'qiluvchanlik, takrorlanmaslik" },
  ],
});

async function main() {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    throw new Error("ADMIN_EMAIL va ADMIN_PASSWORD .env faylida bo'lishi kerak");
  }
  const admin = await upsertTeacher("Administrator", env.ADMIN_EMAIL.toLowerCase(), env.ADMIN_PASSWORD, "ADMIN");
  // Production'da ma'lum parolli namuna o'qituvchi yaratilmaydi (faqat SEED_DEMO=1 bo'lsa).
  if (env.NODE_ENV === "production" && process.env.SEED_DEMO !== "1") {
    console.log(`Admin: ${admin.email} (namuna ma'lumotlar o'tkazib yuborildi)`);
    return;
  }
  const teacher = await upsertTeacher(DEMO_TEACHER.name, DEMO_TEACHER.email, DEMO_TEACHER.password, "TEACHER");

  // Qayta ishga tushirilganda demo imtihon yangidan yaratiladi.
  await prisma.exam.deleteMany({ where: { teacherId: teacher.id, title: { in: [DEMO_EXAM_TITLE, ...OLD_DEMO_TITLES] } } });
  const { tasks, ...examFields } = demoExam;
  const exam = await prisma.exam.create({
    data: {
      ...examFields,
      teacherId: teacher.id,
      tasks: {
        create: tasks.map((t, order) => ({
          order,
          title: t.title,
          description: t.description,
          type: t.type,
          figmaUrl: t.figmaUrl ?? null,
          images: t.images,
          expectedOutput: t.expectedOutput ?? null,
        })),
      },
    },
  });

  console.log(`Admin: ${admin.email}`);
  console.log(`Namuna o'qituvchi: ${teacher.email} / ${DEMO_TEACHER.password}`);
  console.log(`Namuna imtihon: ${exam.title} (${exam.id})`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
