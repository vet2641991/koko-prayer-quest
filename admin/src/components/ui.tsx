// Small shared pieces: status badges, Arabic inputs, messages, buttons that ask before doing something final.
import { useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import type { Status } from '../types.ts';

export function StatusBadge({ status, dirty }: { status: Status | 'none'; dirty?: boolean }) {
  const label = status === 'none' ? 'no lesson' : status;
  return <span className={`badge ${status}`}>{label}{dirty ? ' · unpublished changes' : ''}</span>;
}

/** Arabic text input: right-to-left, Naskh font, and the value is stored exactly as typed (tashkeel included). */
export function ArabicInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} dir="rtl" lang="ar" className={`ar ${props.className ?? ''}`} spellCheck={false} autoCorrect="off" autoCapitalize="off" />;
}
export function ArabicArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} dir="rtl" lang="ar" className={`ar ${props.className ?? ''}`} spellCheck={false} />;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return <label className="field"><span className="label">{label}</span>{children}{hint ? <small className="hint">{hint}</small> : null}</label>;
}

export type Msg = { kind: 'ok' | 'error' | 'info'; text: string } | null;
export function Message({ msg, onClose }: { msg: Msg; onClose?: () => void }) {
  if (!msg) return null;
  return <div className={`msg ${msg.kind}`} role={msg.kind === 'error' ? 'alert' : 'status'}>
    <span>{msg.text}</span>{onClose ? <button className="link" onClick={onClose} aria-label="Dismiss">×</button> : null}
  </div>;
}

/** A button that runs an async action, shows it is busy, and reports the outcome. */
export function ActionButton({ onRun, children, confirm, className, disabled, title }: {
  onRun: () => Promise<void>; children: ReactNode; confirm?: string; className?: string; disabled?: boolean; title?: string;
}) {
  const [busy, setBusy] = useState(false);
  return <button className={className} title={title} disabled={disabled || busy} onClick={async () => {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    try { await onRun(); } finally { setBusy(false); }
  }}>{busy ? '…' : children}</button>;
}

export const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleString() : '—');
