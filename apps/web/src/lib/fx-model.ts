import "server-only";

export const DEFAULT_FX_MODEL = "moonshotai/kimi-k2.5";

export function getFxModel(): string {
  return process.env.FX_MODEL?.trim() || DEFAULT_FX_MODEL;
}

export function isFxConfigured(): boolean {
  return Boolean(process.env.KIMI_API_KEY?.trim());
}

export function getFxDisplayModel(): string {
  return "kimi-coding/kimi-for-coding";
}
