import type { ReactNode } from "react";
import { avatarColor, initials } from "../lib/util";

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * .38, background: `linear-gradient(135deg, ${avatarColor(name)}, ${avatarColor(name + "x")})` }} aria-hidden>{initials(name)}</span>;
}

export function Stat({ icon, value, label, tint = 1, spark }: { icon: ReactNode; value: ReactNode; label: string; tint?: 1 | 2 | 3 | 4; spark?: number[] }) {
  return (
    <div className={`glass stat tint${tint}`}>
      <span className="ico">{icon}</span>
      <span className="v">{value}</span><span className="l">{label}</span>
      {spark && spark.length > 1 && <Spark data={spark} />}
    </div>
  );
}

export function Spark({ data, w = 84, h = 34 }: { data: number[]; w?: number; h?: number }) {
  const max = Math.max(...data, 1), min = Math.min(...data, 0);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - 3 - ((v - min) / (max - min || 1)) * (h - 6)}`).join(" ");
  return <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden><polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function Bars({ items, unit = "%" }: { items: { label: string; value: number }[]; unit?: string }) {
  return (
    <div className="bars" role="img" aria-label="مخطط أعمدة">
      {items.map((it, i) => (
        <div className="bar" key={i}><b>{it.value}{unit}</b><i style={{ height: `${Math.max(it.value, 3)}%` }} /><span title={it.label}>{it.label}</span></div>
      ))}
    </div>
  );
}

export function Donut({ value, size = 96, label }: { value: number; size?: number; label?: string }) {
  const r = size / 2 - 9, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${value}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="10" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(c * value) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dasharray .8s" }} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontWeight="800" fontSize={size / 4.2} fill="var(--text)">{label ?? `${value}%`}</text>
    </svg>
  );
}

export const Rank = ({ n }: { n: number }) => <span className={"rank" + (n <= 3 ? ` r${n}` : "")}>{n}</span>;
export const PageHead = ({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) => (
  <div className="page-head"><div><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div><div className="row">{children}</div></div>
);
