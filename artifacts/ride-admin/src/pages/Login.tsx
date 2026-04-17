import { useState } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { useLocation } from "wouter";
import { Loader2, Eye, EyeOff } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("admin@ride.app");
  const [password, setPassword] = useState("admin1234");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAdmin();
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      setLocation("/");
    } catch (err: any) {
      setError(err.message ?? "Login gagal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a3a5c] to-[#0f2540] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#1a7a6a] flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white font-bold text-3xl">R</span>
          </div>
          <h1 className="text-2xl font-bold text-white">RIDE Admin</h1>
          <p className="text-white/50 text-sm mt-1">Panel Administrasi</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-2xl p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-5">Masuk ke Akun Admin</h2>

          {error && (
            <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a] focus:border-transparent"
                placeholder="admin@ride.app"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a] focus:border-transparent"
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPass(s => !s)} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit" disabled={loading}
            className="mt-6 w-full bg-[#1a7a6a] hover:bg-[#15695b] text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" /> Memproses...</> : "Masuk"}
          </button>
        </form>

        <p className="text-center text-white/30 text-xs mt-4">RIDE Super App © 2025</p>
      </div>
    </div>
  );
}
