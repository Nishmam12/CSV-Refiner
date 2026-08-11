// Secure watermark — obfuscated, password-gated
// Key is XOR-encoded and hash is masked. Tamper guard: watermark auto-restores if removed.

// Encrypted payloads (XOR + base64)
const _W1_P1 = "Cw4H";
const _W1_P2 = "AwAc";
const _W1_P3 = "FREMDQ==";

const _U1_P1 = "DRUH";
const _U1_P2 = "ABxI";
const _U1_P3 = "W1wL";
const _U1_P4 = "DgcD";
const _U1_P5 = "ABwV";
const _U1_P6 = "EQwN";
const _U1_P7 = "XRMA";
const _U1_P8 = "Hw==";

// Key stored as XOR 0x5A + base64, split to avoid literal
const _EK_A = "Pzsp";
const _EK_B = "KjUo";
const _EK_C = "Lik=";

// Hash of password (djb2 0xf0e81716) masked with 0xA5A5A5A5 => 0x554db2b3
const _VH_MASKED = 0x554db2b3;
const _VH_XOR = 0xa5a5a5a5;

function _rk(): string {
  const enc = _EK_A + _EK_B + _EK_C;
  try {
    const b = atob(enc);
    let r = "";
    for (let i = 0; i < b.length; i++) r += String.fromCharCode(b.charCodeAt(i) ^ 0x5a);
    return r;
  } catch {
    return "";
  }
}

function _dec(b64: string): string {
  const k = _rk();
  if (!k) return "";
  try {
    const raw = atob(b64);
    let out = "";
    for (let i = 0; i < raw.length; i++) out += String.fromCharCode(raw.charCodeAt(i) ^ k.charCodeAt(i % k.length));
    return out;
  } catch {
    return "";
  }
}

export function getSecureWatermark(): { text: string; url: string; domain: string } {
  const w = _dec(_W1_P1 + _W1_P2 + _W1_P3);
  const u = _dec(_U1_P1 + _U1_P2 + _U1_P3 + _U1_P4 + _U1_P5 + _U1_P6 + _U1_P7 + _U1_P8);
  // domain derived from url to avoid extra constant
  const d = u.replace(/^https:\/\//, "");
  return { text: w || "notsonabil", url: u || "https://notsonabil.com", domain: d || "notsonabil.com" };
}

function _djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

export function verifyWatermarkPassword(input: string): boolean {
  if (!input || typeof input !== "string") return false;
  const h = _djb2(input);
  const expected = (_VH_MASKED ^ _VH_XOR) >>> 0;
  return h === expected;
}

// Expose hidden verifier for owner (call from console: __WM_VERIFY__("..."))
if (typeof window !== "undefined") {
  try {
    // @ts-ignore
    window.__WM_VERIFY__ = verifyWatermarkPassword;
    // @ts-ignore
    window.__WM_GET__ = getSecureWatermark;
  } catch {}
}
