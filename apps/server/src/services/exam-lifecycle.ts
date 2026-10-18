import { prisma } from "../db.js";

/**
 * Imtihonni yakunlaydi: ishlayotgan o'quvchilar topshirilgan deb belgilanadi, kod bo'shatiladi.
 * AI yoqilgan bo'lsa GRADING (8-bosqichda baholash navbati shu yerga ulanadi), aks holda FINISHED.
 * 2-bosqichda bu yerga exam:ended va 15 soniya kutish qo'shiladi.
 */
export async function finishExam(examId: string, aiEnabled: boolean) {
  const now = new Date();
  const [, exam] = await prisma.$transaction([
    prisma.attempt.updateMany({
      where: { examId, status: { in: ["JOINED", "WORKING"] } },
      data: { status: "SUBMITTED", submittedAt: now },
    }),
    prisma.exam.update({
      where: { id: examId },
      data: { status: aiEnabled ? "GRADING" : "FINISHED", code: null, endsAt: now },
    }),
  ]);
  return exam;
}
