import { Rocket, Timer, Flag } from "lucide-react";

/** مشهد «سباق التحدي»: مركبتك تتقدّم بالإجابات الصحيحة، وعقرب الوقت يتقدّم مع مرور الزمن. لا إحراج: لا أحد «يخسر» أمامك. */
export function RaceScene({ correct, total, timePct }: { correct: number; total: number; timePct: number }) {
  const me = total ? correct / total : 0;
  return (
    <div className="glass track" aria-label={`تقدّمك: ${correct} من ${total}`}>
      <div className="lane"><span className="runner" style={{ background: "linear-gradient(135deg,#0b8794,#6354e8)", insetInlineStart: `calc((100% - 44px) * ${me})`, width: 44 }}><Rocket size={22} /></span><Flag className="finish" size={22} /></div>
      <div className="lane" style={{ height: 34, opacity: .8 }}><span className="runner" style={{ background: "linear-gradient(135deg,#d9762b,#c28a12)", insetInlineStart: `calc((100% - 34px) * ${Math.min(timePct, 1)})`, width: 34, height: 28, top: 3, transition: "inset-inline-start .2s linear" }}><Timer size={16} /></span></div>
      <div className="row small muted" style={{ justifyContent: "space-between" }}><span>🚀 أنت: {correct} إجابة صحيحة</span><span>⏱ عقرب الوقت</span></div>
    </div>
  );
}

/** مشهد «حديقة المعرفة»: تنمو النبتة مع كل إجابة صحيحة وتُزهر عند الاكتمال. */
export function GardenScene({ correct, total, answered }: { correct: number; total: number; answered: number }) {
  const p = total ? correct / total : 0;
  const stem = 20 + p * 90;
  return (
    <div className="garden" role="img" aria-label={`نبتتك: ${correct} من ${total}`}>
      <svg viewBox="0 0 400 210" preserveAspectRatio="xMidYMax meet">
        <ellipse cx="200" cy="168" rx="150" ry="22" fill="#5b3f27" />
        <g className="stage-grow" style={{ transform: `scaleY(${0.25 + p * 0.75})` }}>
          <path d={`M200 170 C198 ${170 - stem * .5} 204 ${170 - stem * .8} 200 ${170 - stem}`} stroke="#3f9b4f" strokeWidth="7" fill="none" strokeLinecap="round" />
        </g>
        {[{ x: -1, t: .2, y: .35 }, { x: 1, t: .4, y: .55 }, { x: -1, t: .6, y: .72 }, { x: 1, t: .8, y: .86 }].map((l, i) => (
          <g key={i} style={{ opacity: p >= l.t ? 1 : 0, transition: "opacity .7s, transform .7s", transform: `translate(${200 + l.x * 4}px, ${170 - stem * l.y}px) scale(${p >= l.t ? 1 : .2})` }}>
            <path d={`M0 0 C${l.x * 20} -18 ${l.x * 44} -10 ${l.x * 40} 4 C${l.x * 26} 12 ${l.x * 8} 8 0 0`} fill="#5cc26e" />
          </g>))}
        <g style={{ opacity: p >= 1 ? 1 : 0, transition: "opacity .8s, transform .8s", transform: `translate(200px, ${170 - stem}px) scale(${p >= 1 ? 1 : .1})` }}>
          {[0, 60, 120, 180, 240, 300].map((a) => <ellipse key={a} cx="0" cy="-17" rx="9" ry="15" fill="#ff8fb1" transform={`rotate(${a})`} />)}<circle r="9" fill="#ffd24a" />
        </g>
        {Array.from({ length: Math.min(answered, 8) }, (_, i) => <circle key={i} cx={60 + i * 40} cy={28 + (i % 2) * 14} r="3.5" fill="#6ec7ff" opacity=".7" />)}
      </svg>
      <div className="ground" style={{ height: 40 }} />
    </div>
  );
}
