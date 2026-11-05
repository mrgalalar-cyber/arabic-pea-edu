import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/* ---------- تنبيهات سريعة ---------- */
type Toast = { id: number; msg: string; err?: boolean };
const ToastCtx = createContext<(msg: string, err?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((msg: string, err = false) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, msg, err }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), err ? 5000 : 2800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">{list.map((t) => <div key={t.id} className={"toast" + (t.err ? " err" : "")}>{t.msg}</div>)}</div>
    </ToastCtx.Provider>
  );
}

/* ---------- جلب بيانات بسيط ---------- */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let cancel = false; setLoading(true); setError(null);
    fn().then((d) => { if (!cancel) { setData(d); setLoading(false); } })
        .catch((e) => { if (!cancel) { setError(e?.message ?? "تعذر تحميل البيانات"); setLoading(false); } });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1), setData };
}

/* ---------- تعديلات غير محفوظة ---------- */
export function useDirty() {
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  return { dirty, touch: () => setDirty(true), clean: () => setDirty(false) };
}
export function SaveBar({ dirty, saving, onSave, onCancel, label = "حفظ" }: { dirty: boolean; saving?: boolean; onSave: () => void; onCancel?: () => void; label?: string }) {
  return (
    <div className="savebar no-print">
      <span className={"dot" + (dirty ? " dirty" : "")} />
      <span className="grow small">{dirty ? "توجد تعديلات غير محفوظة" : "كل التعديلات محفوظة"}</span>
      {onCancel && <button className="btn ghost sm" onClick={onCancel} type="button">إلغاء</button>}
      <button className="btn sm" disabled={!dirty || saving} onClick={onSave} type="button">{saving ? "جارٍ الحفظ…" : label}</button>
    </div>
  );
}

/* ---------- نافذة منبثقة ---------- */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return createPortal(
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"modal glass" + (wide ? " wide" : "")} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h2 style={{ margin: 0 }}>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="إغلاق"><X size={20} /></button></div>
        {children}
      </div>
    </div>, document.body);
}

export function Confirm({ text, onYes, onNo, yes = "تأكيد", danger }: { text: string; onYes: () => void; onNo: () => void; yes?: string; danger?: boolean }) {
  return (
    <Modal title="تأكيد" onClose={onNo}>
      <p>{text}</p>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn ghost" onClick={onNo}>إلغاء</button>
        <button className={"btn" + (danger ? " danger" : "")} onClick={onYes}>{yes}</button>
      </div>
    </Modal>
  );
}
export const Empty = ({ icon, text, children }: { icon?: ReactNode; text: string; children?: ReactNode }) => (
  <div className="empty">{icon}<p>{text}</p>{children}</div>
);
export const Loading = () => <div className="empty" role="status"><p>جارٍ التحميل…</p></div>;
export const ErrorBox = ({ msg }: { msg: string }) => <div className="notice bad" role="alert">{msg}</div>;
