import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color?: string;
  trend?: { value: number; label: string };
}

export function StatCard({ title, value, subtitle, icon: Icon, color = "#1a7a6a", trend }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-500 font-medium truncate">{title}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 truncate">{value}</p>
          {subtitle && <p className="mt-0.5 text-xs text-gray-400 truncate">{subtitle}</p>}
          {trend && (
            <p className={cn("mt-1 text-xs font-medium", trend.value >= 0 ? "text-green-600" : "text-red-500")}>
              {trend.value >= 0 ? "+" : ""}{trend.value}% {trend.label}
            </p>
          )}
        </div>
        <div className="ml-3 flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + "1a" }}>
          <Icon size={20} style={{ color }} />
        </div>
      </div>
    </div>
  );
}
