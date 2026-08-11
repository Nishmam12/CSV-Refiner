"use client";
import { useEffect, useRef } from "react";
import { getSecureWatermark } from "./secure";

export function ProtectedWatermark() {
  const ref = useRef<HTMLAnchorElement>(null);
  const wm = getSecureWatermark();

  useEffect(() => {
    const id = "wm-notsonabil-root";
    const ensure = () => {
      let el = document.getElementById(id) as HTMLAnchorElement | null;
      if (!el) {
        el = document.createElement("a");
        el.id = id;
        el.href = wm.url;
        el.target = "_blank";
        el.rel = "noopener noreferrer";
        el.textContent = wm.text;
        el.setAttribute("data-wm", "1");
        // inline styles to survive CSS removal
        el.style.cssText =
          "position:fixed;bottom:12px;right:12px;z-index:9999;user-select:none;border-radius:6px;background:rgba(24,24,27,0.8);padding:4px 8px;font-size:10px;font-weight:500;letter-spacing:0.1em;color:#71717a;border:1px solid rgba(63,63,70,0.5);backdrop-filter:blur(4px);text-decoration:none;";
        document.body.appendChild(el);
        ref.current = el;
      } else {
        // repair if tampered
        if (el.textContent !== wm.text) el.textContent = wm.text;
        if (el.getAttribute("href") !== wm.url) el.setAttribute("href", wm.url);
        if (el.style.display === "none") el.style.display = "";
        el.style.visibility = "visible";
        el.style.opacity = "1";
      }
    };

    ensure();

    const obs = new MutationObserver(() => ensure());
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "href"] });

    const iv = setInterval(ensure, 1500);
    const onVis = () => ensure();
    document.addEventListener("visibilitychange", onVis);

    return () => {
      obs.disconnect();
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [wm.text, wm.url]);

  // Also render declarative anchor for SSR/hydration (will be replaced/guarded by effect)
  return (
    <a
      ref={ref}
      id="wm-notsonabil-root"
      href={wm.url}
      target="_blank"
      rel="noopener noreferrer"
      data-wm="1"
      className="fixed bottom-3 right-3 z-50 select-none rounded bg-zinc-900/80 px-2 py-1 text-[10px] font-medium tracking-widest text-zinc-500 backdrop-blur border border-zinc-800/50 hover:bg-zinc-800 hover:text-cyan-400 hover:border-zinc-700 transition-colors"
    >
      {wm.text}
    </a>
  );
}

export function WatermarkText() {
  const { text } = getSecureWatermark();
  return <>{text}</>;
}

export function WatermarkLink({ className, children }: { className?: string; children?: React.ReactNode }) {
  const { url } = getSecureWatermark();
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}
