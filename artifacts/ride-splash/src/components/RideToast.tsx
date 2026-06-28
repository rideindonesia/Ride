import { useEffect, useState, useCallback } from "react";

export type RideToastItem = {
  id: string;
  icon: string;
  title: string;
  body?: string;
  color: "green" | "blue" | "orange" | "red" | "purple";
  duration?: number;
};

type Props = {
  toasts: RideToastItem[];
  onRemove: (id: string) => void;
};

const COLOR_MAP = {
  green:  { bg: "#1a7a4a", border: "#14a85a" },
  blue:   { bg: "#1a3a8c", border: "#2a5ade" },
  orange: { bg: "#a85a00", border: "#f07000" },
  red:    { bg: "#8c1a1a", border: "#de2a2a" },
  purple: { bg: "#4a1a8c", border: "#7a3ade" },
};

function RideToastCard({ item, onRemove }: { item: RideToastItem; onRemove: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = setTimeout(() => setVisible(true), 30);
    const hide = setTimeout(() => setVisible(false), (item.duration ?? 4000) - 350);
    const remove = setTimeout(onRemove, item.duration ?? 4000);
    return () => { clearTimeout(show); clearTimeout(hide); clearTimeout(remove); };
  }, [item.duration, onRemove]);

  const c = COLOR_MAP[item.color];

  return (
    <div
      onClick={onRemove}
      style={{
        background: c.bg,
        border: `1.5px solid ${c.border}`,
        borderRadius: 16,
        padding: "12px 16px",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
        cursor: "pointer",
        transform: visible ? "translateY(0) scale(1)" : "translateY(-20px) scale(0.96)",
        opacity: visible ? 1 : 0,
        transition: "all 0.3s cubic-bezier(0.34,1.56,0.64,1)",
        marginBottom: 8,
        minWidth: 260,
        maxWidth: 320,
      }}
    >
      <span style={{ fontSize: 22, lineHeight: 1.2 }}>{item.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{item.title}</div>
        {item.body && <div style={{ color: "rgba(255,255,255,0.82)", fontSize: 12, marginTop: 2, lineHeight: 1.4 }}>{item.body}</div>}
      </div>
    </div>
  );
}

export function RideToastContainer({ toasts, onRemove }: Props) {
  if (toasts.length === 0) return null;
  return (
    <div style={{
      position: "fixed",
      top: 16,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 99999,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      pointerEvents: "none",
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{ pointerEvents: "auto" }}>
          <RideToastCard item={t} onRemove={() => onRemove(t.id)} />
        </div>
      ))}
    </div>
  );
}

// Hook untuk pakai di dalam component
export function useRideToast() {
  const [toasts, setToasts] = useState<RideToastItem[]>([]);

  const showToast = useCallback((item: Omit<RideToastItem, "id">) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    setToasts(prev => [...prev.slice(-2), { ...item, id }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, showToast, removeToast };
}
