export type FilenameMeta = {
  product: string | null;
  connection: string | null;
  method: string | null;
  clickNumber: string | null;
  stage: "PROCESSED" | "REFINED" | null;
  raw: string;
};

export function parseFilename(filename: string): FilenameMeta {
  const raw = filename;
  let stage: FilenameMeta["stage"] = null;
  if (/PROCESSED/i.test(filename)) stage = "PROCESSED";
  else if (/REFINED/i.test(filename)) stage = "REFINED";

  let clickNumber: string | null = null;
  const clickMatch = filename.match(/(?:CLICK|TAP)[-_ ]?0*(\d+)/i);
  if (clickMatch) {
    // preserve CLICK-001 style
    const m = filename.match(/(CLICK|TAP)[-_ ]?0*\d+/i);
    if (m) clickNumber = m[0].toUpperCase().replace(/[_ ]/g, "-");
  }

  // Product: before first " - " or before CLICK marker
  let product: string | null = null;
  const withoutExt = filename.replace(/\.csv$/i, "");
  // Try split by " - "
  const dashParts = withoutExt.split(" - ");
  if (dashParts.length > 1) {
    product = dashParts[0].trim() || null;
  } else {
    // Try split by "-CLICK" / "-TAP"
    const markerIdx = withoutExt.search(/-?(CLICK|TAP)/i);
    if (markerIdx > 0) product = withoutExt.slice(0, markerIdx).replace(/[-_]+$/g, "").trim() || null;
    else product = withoutExt.trim() || null;
  }
  // Connection/method heuristics: look for wireless/wired/mic/etc in middle parts
  let connection: string | null = null;
  let method: string | null = null;
  if (dashParts.length >= 2) {
    // second part often contains method/connection
    const middle = dashParts.slice(1).join(" - ");
    if (/wireless/i.test(middle)) connection = "wireless";
    else if (/wired/i.test(middle)) connection = "wired";
    if (/mic/i.test(middle)) method = "Mic";
  }

  return { product, connection, method, clickNumber, stage, raw };
}
