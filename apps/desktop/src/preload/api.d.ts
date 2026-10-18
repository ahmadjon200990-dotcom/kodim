import type { KodimApi } from "../common/api";

declare global {
  interface Window {
    kodim: KodimApi;
  }
}

export {};
