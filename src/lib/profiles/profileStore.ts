import type { Profile } from "@/types/profile";

const STORAGE_KEY = "osltt:profiles";
const DEFAULT_PROFILES: Profile[] = [
  { id: "default", name: "OSLTT Mouse Default", thresholdPct: 10, minDeviationMs: 2, sensitivity: "balanced", handling: "flag", isDefault: true, createdAt: 0 },
  { id: "strict", name: "OSLTT Mouse Strict", thresholdPct: 5, minDeviationMs: 1.5, sensitivity: "aggressive", handling: "remove", isDefault: false, createdAt: 0 },
  { id: "keyboard", name: "OSLTT Keyboard", thresholdPct: 10, minDeviationMs: 2.5, sensitivity: "conservative", handling: "flag", isDefault: false, createdAt: 0 },
  { id: "8k", name: "OSLTT 8K", thresholdPct: 15, minDeviationMs: 1, sensitivity: "balanced", handling: "flag", isDefault: false, createdAt: 0 },
];

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadProfiles(): Profile[] {
  if (!isBrowser()) return [...DEFAULT_PROFILES];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_PROFILES];
    const parsed = JSON.parse(raw) as Profile[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_PROFILES];
    // validate shape
    return parsed.filter((p) => p.id && p.name && typeof p.thresholdPct === "number");
  } catch {
    return [...DEFAULT_PROFILES];
  }
}

export function saveProfiles(profiles: Profile[]): void {
  if (!isBrowser()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

export function getDefaultProfile(profiles: Profile[]): Profile {
  return profiles.find((p) => p.isDefault) ?? profiles[0] ?? DEFAULT_PROFILES[0];
}

export function setDefaultProfile(profiles: Profile[], id: string): Profile[] {
  return profiles.map((p) => ({ ...p, isDefault: p.id === id }));
}

export function upsertProfile(profiles: Profile[], profile: Profile): Profile[] {
  const idx = profiles.findIndex((p) => p.id === profile.id);
  if (idx >= 0) {
    const next = [...profiles];
    next[idx] = profile;
    return next;
  }
  return [...profiles, profile];
}

export function deleteProfile(profiles: Profile[], id: string): Profile[] {
  const next = profiles.filter((p) => p.id !== id);
  if (next.length > 0 && !next.some((p) => p.isDefault)) next[0].isDefault = true;
  return next;
}

export function duplicateProfile(profiles: Profile[], id: string): Profile[] {
  const src = profiles.find((p) => p.id === id);
  if (!src) return profiles;
  const dup: Profile = { ...src, id: `${src.id}-copy-${Date.now()}`, name: `${src.name} Copy`, isDefault: false, createdAt: Date.now() };
  return [...profiles, dup];
}
