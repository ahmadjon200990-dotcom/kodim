// Testlar uchun: manbadagi `./x.js` importlarini `./x.ts` ga yo'naltiradi (build qilmasdan sinash).
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
      try {
        return next(specifier.slice(0, -3) + ".ts", context);
      } catch {
        // .ts yo'q — asl yo'l
      }
    }
    return next(specifier, context);
  },
});
