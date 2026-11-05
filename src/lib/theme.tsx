import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Pref = "light" | "dark" | "system";
const Ctx = createContext<{ pref: Pref; theme: "light" | "dark"; setPref: (p: Pref) => void; toggle: () => void }>({ pref: "system", theme: "light", setPref: () => {}, toggle: () => {} });
export const useTheme = () => useContext(Ctx);

const systemDark = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<Pref>(() => { try { return (localStorage.getItem("theme") as Pref) || "system"; } catch { return "system"; } });
  const [sys, setSys] = useState(systemDark());
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)"); const h = () => setSys(mq.matches);
    mq.addEventListener("change", h); return () => mq.removeEventListener("change", h);
  }, []);
  const theme = pref === "system" ? (sys ? "dark" : "light") : pref;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0b4150" : "#e6f0ff");
  }, [theme]);
  const setPref = useCallback((p: Pref) => { setPrefState(p); try { localStorage.setItem("theme", p); } catch { /* التخزين غير متاح */ } }, []);
  const toggle = useCallback(() => setPref(theme === "dark" ? "light" : "dark"), [theme, setPref]);
  return <Ctx.Provider value={{ pref, theme, setPref, toggle }}>{children}</Ctx.Provider>;
}

/** مفتاح الوضع: شمس وسحاب نهارًا، وقمر ونجوم ليلًا */
export function ThemeSwitch() {
  const { theme, toggle } = useTheme();
  return (
    <button className="theme-switch" role="switch" aria-checked={theme === "dark"} aria-label="الوضع الليلي" title={theme === "dark" ? "التبديل إلى النهاري" : "التبديل إلى الليلي"} onClick={toggle}>
      <span className="cloud" style={{ width: 22, insetInlineEnd: 10, top: 20 }} />
      <span className="cloud" style={{ width: 16, insetInlineEnd: 22, top: 12 }} />
      {[[10, 8], [20, 22], [30, 10], [14, 27]].map(([x, y], i) => <span key={i} className="star" style={{ insetInlineEnd: x + 6, top: y, animationDelay: `${i * .5}s` }} />)}
      <span className="knob"><span className="crater" style={{ width: 7, height: 7, top: 6, insetInlineStart: 6 }} /><span className="crater" style={{ width: 5, height: 5, top: 17, insetInlineStart: 15 }} /></span>
    </button>
  );
}

/** مصباح معلّق: اسحب الحبل لتبديل الوضع (ويعمل أيضًا بلوحة المفاتيح) */
export function Lamp() {
  const { theme, toggle } = useTheme();
  const [pull, setPull] = useState(0);
  const start = useRef<number | null>(null);
  const down = (e: React.PointerEvent) => { start.current = e.clientY; (e.target as Element).setPointerCapture(e.pointerId); };
  const move = (e: React.PointerEvent) => { if (start.current !== null) setPull(Math.max(0, Math.min(70, e.clientY - start.current))); };
  const up = () => { if (start.current === null) return; if (pull > 28) toggle(); start.current = null; setPull(0); };
  const dark = theme === "dark";
  return (
    <div className="lamp" aria-hidden={false}>
      <svg viewBox="0 0 90 200" width="90" height="200" role="img" aria-label="مصباح: اسحب الحبل لتبديل الوضع الليلي والنهاري">
        <defs><radialGradient id="lg" cx="50%" cy="0%" r="100%"><stop offset="0" stopColor="#ffd86b" stopOpacity=".85" /><stop offset="1" stopColor="#ffd86b" stopOpacity="0" /></radialGradient></defs>
        <line className="cord" x1="45" y1="0" x2="45" y2="34" />
        <path className="shade" d="M20 62 Q45 26 70 62 Z" />
        <ellipse cx="45" cy="64" rx="14" ry="6" fill={dark ? "#4a5a63" : "#ffd24a"} style={{ filter: dark ? "none" : "drop-shadow(0 0 10px #ffd24a)" }} />
        <path className="glow" d="M24 66 L66 66 L98 190 L-8 190 Z" fill="url(#lg)" />
        <line className="cord" x1="45" y1="70" x2="45" y2={118 + pull} />
        <g style={{ transition: start.current === null ? "transform .45s cubic-bezier(.3,1.8,.4,1)" : "none" }}>
          <rect className="bead" x="38" y={118 + pull} width="14" height="26" rx="7" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle())} role="button" aria-label="اسحب أو اضغط لتبديل الوضع" />
        </g>
      </svg>
    </div>
  );
}
