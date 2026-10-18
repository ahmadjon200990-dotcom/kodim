import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { HttpError } from "../lib/http.js";
import { uz } from "../uz.js";

/**
 * Imtihonga 6 xonali kod beradi va LOBBY holatiga o'tkazadi.
 * `Exam.code` unique; kod imtihon tugaganda null qilinadi, shuning uchun
 * takrorlanmaslik faqat faol (LOBBY/RUNNING) imtihonlar orasida ta'minlanadi.
 */
export async function openExamWithCode(examId: string) {
  for (let i = 0; i < 20; i++) {
    const code = String(randomInt(100_000, 1_000_000));
    try {
      return await prisma.exam.update({ where: { id: examId }, data: { status: "LOBBY", code } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  throw new HttpError(503, uz.codeGenerationFailed);
}
