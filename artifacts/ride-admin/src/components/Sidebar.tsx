import { Link, useRoute, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/hooks/useAdmin";
import {
  LayoutDashboard, Users, Wrench, ShoppingBag, Wallet,
  Tag, BarChart3, Settings, LogOut, ChevronRight, Menu, X, TicketCheck
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Wrench, label: "Mitra", path: "/mitra" },
  { icon: Users, label: "Pengguna", path: "/pengguna" },
  { icon: ShoppingBag, label: "Order", path: "/orders" },
  { icon: Wallet, label: "Keuangan", path: "/keuangan" },
  { icon: Tag, label: "Voucher", path: "/voucher" },
  { icon: BarChart3, label: "Laporan", path: "/laporan" },
  { icon: TicketCheck, label: "Tiket", path: "/tiket" },
  { icon: Settings, label: "Pengaturan", path: "/settings" },
];

function NavItem({ icon: Icon, label, path }: { icon: any; label: string; path: string }) {
  const [active] = useRoute(path === "/" ? "/" : path + "/*?");
  const [exactActive] = useRoute(path);
  const isActive = path === "/" ? exactActive : active || exactActive;
  return (
    <Link href={path}>
      <a className={cn(
        "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
        isActive
          ? "bg-white/15 text-white shadow-sm"
          : "text-white/70 hover:bg-white/10 hover:text-white"
      )}>
        <Icon size={18} />
        <span>{label}</span>
        {isActive && <ChevronRight size={14} className="ml-auto" />}
      </a>
    </Link>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { admin, logout } = useAdmin();
  const [, setLocation] = useLocation();

  const handleLogout = async () => {
    await logout();
    setLocation("/login");
  };

  return (
    <>
      {/* Mobile overlay */}
      {!collapsed && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={onToggle} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 h-screen z-30 flex flex-col transition-all duration-300 ease-in-out",
        "bg-gradient-to-b from-[#1a3a5c] to-[#0f2540]",
        collapsed ? "-translate-x-full lg:translate-x-0 lg:w-16" : "translate-x-0 w-64"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#1a7a6a] flex items-center justify-center">
                <span className="text-white font-bold text-sm">R</span>
              </div>
              <div>
                <p className="text-white font-bold text-sm">RIDE Admin</p>
                <p className="text-white/50 text-xs">Panel Administrasi</p>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 rounded-full bg-[#1a7a6a] flex items-center justify-center mx-auto">
              <span className="text-white font-bold text-sm">R</span>
            </div>
          )}
          <button onClick={onToggle} className="text-white/60 hover:text-white lg:flex hidden">
            {collapsed ? <Menu size={18} /> : <X size={18} />}
          </button>
          <button onClick={onToggle} className="text-white/60 hover:text-white lg:hidden">
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className={cn("flex-1 overflow-y-auto py-4", collapsed ? "px-1" : "px-3")}>
          <div className="space-y-1">
            {navItems.map(item => (
              collapsed ? (
                <Link key={item.path} href={item.path}>
                  <a className="flex items-center justify-center h-10 w-10 mx-auto rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition-all" title={item.label}>
                    <item.icon size={18} />
                  </a>
                </Link>
              ) : (
                <NavItem key={item.path} {...item} />
              )
            ))}
          </div>
        </nav>

        {/* Admin info + logout */}
        <div className="border-t border-white/10 p-3">
          {!collapsed && admin && (
            <div className="px-2 py-1 mb-2">
              <p className="text-white/80 text-xs font-medium truncate">{admin.name}</p>
              <p className="text-white/40 text-xs truncate">{admin.email}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className={cn(
              "flex items-center gap-3 w-full rounded-lg text-sm font-medium text-red-300 hover:bg-red-900/30 hover:text-red-200 transition-all duration-150",
              collapsed ? "justify-center h-10" : "px-4 py-2.5"
            )}
          >
            <LogOut size={18} />
            {!collapsed && <span>Keluar</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
