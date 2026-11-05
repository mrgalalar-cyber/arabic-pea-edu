const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function genJoinCode(len = 8) {
  const b = new Uint8Array(len); crypto.getRandomValues(b);
  return Array.from(b, (x) => ALPHA[x % ALPHA.length]).join("");
}
export const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("ar", { year: "numeric", month: "short", day: "numeric" }) : "—");
export const fmtDateTime = (s?: string | null) => (s ? new Date(s).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" }) : "—");
export const fmtSecs = (ms: number) => { const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} د` : `${s} ث`; };
export const pct = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : 0);
export const daysAgo = (s?: string | null) => (s ? Math.floor((Date.now() - new Date(s).getTime()) / 86400000) : Infinity);
export const toLocalInput = (s?: string | null) => (s ? new Date(new Date(s).getTime() - new Date(s).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
export const fromLocalInput = (s: string) => (s ? new Date(s).toISOString() : null);

export async function copyText(t: string) { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } }

export function downloadFile(name: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿" + content], { type: mime });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function toCsv(rows: (string | number | null | undefined)[][]) {
  return rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
}
const AV = ["#0b8794", "#6354e8", "#d9762b", "#2f9e5f", "#c2467a", "#3b73d9", "#8a5cc4", "#c28a12"];
export const avatarColor = (seed: string) => AV[[...seed].reduce((n, c) => n + c.charCodeAt(0), 0) % AV.length];
export const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
