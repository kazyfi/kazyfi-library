import { Eye, EyeOff, Lock, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { SessionInfo } from '../types/library';

interface AdminLoginModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (session: SessionInfo) => void;
}

interface AdminStatusResponse {
  configured: boolean;
  source: 'env' | 'claimed' | 'unconfigured';
}

export function AdminLoginModal({ open, onClose, onSuccess }: AdminLoginModalProps) {
  const [statusLoading, setStatusLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [authSource, setAuthSource] = useState<'env' | 'claimed' | 'unconfigured'>('env');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!open) return;

    let active = true;
    setErrorMsg('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setStatusLoading(true);

    fetch('/api/auth/admin-status')
      .then((res) => res.json())
      .then((data: AdminStatusResponse) => {
        if (!active) return;
        setConfigured(Boolean(data.configured));
        setAuthSource(data.source ?? 'unconfigured');
      })
      .catch(() => {
        if (!active) return;
        setConfigured(true);
        setAuthSource('env');
      })
      .finally(() => {
        if (active) setStatusLoading(false);
      });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      active = false;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg('');

    const trimmedUser = username.trim();
    if (!trimmedUser) {
      setErrorMsg('Username admin wajib diisi.');
      return;
    }
    if (!password) {
      setErrorMsg('Password admin wajib diisi.');
      return;
    }

    if (!configured) {
      if (trimmedUser.length < 3) {
        setErrorMsg('Username admin minimal 3 karakter.');
        return;
      }
      if (password.length < 6) {
        setErrorMsg('Password admin minimal 6 karakter.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Konfirmasi password tidak cocok.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const endpoint = configured ? '/api/auth/admin-login' : '/api/auth/admin-setup';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmedUser, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Autentikasi admin gagal.');
      }
      onSuccess(data as SessionInfo);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal masuk ke dashboard admin.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/50 dark:bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-login-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200/80 dark:border-indigo-800 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-[#1A2B5E] dark:text-indigo-400" />
            </div>
            <div>
              <h2
                id="admin-login-title"
                className="text-base font-bold text-slate-950 dark:text-slate-50"
              >
                {configured ? 'Login Admin' : 'Aktivasi Akun Admin'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Kazyfi Library · Panel Pustakawan
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog login admin"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {statusLoading ? (
          <div className="p-6 space-y-4">
            <div className="h-4 w-48 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
            <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
            <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {!configured && (
              <div className="p-3.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/50 border border-indigo-200/80 dark:border-indigo-800/80 text-xs text-indigo-950 dark:text-indigo-200 leading-relaxed">
                Akun administrator Kazyfi Library belum dikonfigurasi. Tetapkan username dan
                password admin untuk mengaktifkan akses manajemen koleksi, sirkulasi, dan pelaporan.
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs font-medium text-red-800 dark:text-red-200"
              >
                {errorMsg}
              </div>
            )}

            <div>
              <label
                htmlFor="admin-username"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Username Admin
              </label>
              <input
                id="admin-username"
                type="text"
                autoComplete="username"
                autoFocus
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan username admin"
                className="w-full px-3.5 py-2 text-sm bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-900/15 focus:border-[#1A2B5E] dark:focus:border-indigo-500"
              />
            </div>

            <div>
              <label
                htmlFor="admin-password"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={configured ? 'current-password' : 'new-password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password admin"
                  className="w-full pl-3.5 pr-10 py-2 text-sm bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-900/15 focus:border-[#1A2B5E] dark:focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {!configured && (
              <div>
                <label
                  htmlFor="admin-confirm-password"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Konfirmasi Password
                </label>
                <input
                  id="admin-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ulangi password admin"
                  className="w-full px-3.5 py-2 text-sm bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-900/15 focus:border-[#1A2B5E] dark:focus:border-indigo-500"
                />
              </div>
            )}

            <div className="flex items-center justify-between pt-2 gap-3">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {authSource === 'env'
                    ? 'Verifikasi server aktif'
                    : authSource === 'claimed'
                    ? 'Terkunci & terenkripsi'
                    : 'Aktivasi satu kali'}
                </span>
              </span>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  {submitting
                    ? 'Memproses...'
                    : configured
                    ? 'Masuk Admin'
                    : 'Aktifkan & Masuk'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
