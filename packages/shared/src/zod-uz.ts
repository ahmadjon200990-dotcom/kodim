// Zod xatolarining sodda o'zbekcha matnlari (server javoblari va panel formalari uchun).
// Sxemada o'z xabari berilgan bo'lsa (refine) — o'sha ishlatiladi; bu faqat standart holatlar.
import { z } from "zod";

z.config({
  customError: (issue) => {
    switch (issue.code) {
      case "invalid_type":
        return issue.input === undefined || issue.input === null ? "to'ldirilishi shart" : "noto'g'ri qiymat";
      case "too_small": {
        const min = Number(issue.minimum);
        if (issue.origin === "string") return min <= 1 ? "to'ldirilishi shart" : `kamida ${min} ta belgi bo'lishi kerak`;
        if (issue.origin === "array") return `kamida ${min} ta bo'lishi kerak`;
        return `kamida ${min} bo'lishi kerak`;
      }
      case "too_big": {
        const max = Number(issue.maximum);
        if (issue.origin === "string") return `ko'pi bilan ${max} ta belgi bo'lishi mumkin`;
        if (issue.origin === "array") return `ko'pi bilan ${max} ta bo'lishi mumkin`;
        return `ko'pi bilan ${max} bo'lishi mumkin`;
      }
      case "invalid_format":
        if (issue.format === "email") return "to'g'ri email kiriting";
        if (issue.format === "url") return "to'g'ri havola kiriting (https://...)";
        return "noto'g'ri format";
      case "invalid_value":
        return "ruxsat etilmagan qiymat";
      default:
        return undefined;
    }
  },
});

export {};
