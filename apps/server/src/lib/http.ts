import { z } from "zod";

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export const IdParams = z.object({ id: z.string().min(1) });
