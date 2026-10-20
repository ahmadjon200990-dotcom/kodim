// emmet paketining tiplari package.json "exports" orqali topilmaydi — ishlatiladigan qismi uchun minimal e'lon.
declare module "emmet" {
  export interface EmmetConfig {
    type?: "markup" | "stylesheet";
    syntax?: string;
    options?: Record<string, unknown>;
    variables?: Record<string, string>;
  }
  export interface ExtractedAbbreviation {
    abbreviation: string;
    location: number;
    start: number;
    end: number;
  }
  export function extract(
    line: string,
    pos?: number,
    options?: { type?: "markup" | "stylesheet"; lookAhead?: boolean; prefix?: string },
  ): ExtractedAbbreviation | undefined;
  export default function expand(abbr: string, config?: EmmetConfig): string;
}
