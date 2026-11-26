import {
  Eye,
  EyeOff,
  KeyRound,
  LogIn,
  ShieldCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { LibraryBootstrapPayload, SessionInfo } from '../types/library';

export type MemberAuthMode = 'login' | 'signup' | 'activate';

interface MemberAuthModalProps {
  open: boolean;
  initialMode: MemberAuthMode;
  onClose: () => void;
  onSuccess: (session: SessionInfo, sync?: LibraryBootstrapPayload) => void;
}

export function MemberAuthModal({
  open,
  initialMode,
  onClose,
  onSuccess,
}: MemberAuthModalProps) {
  const [mode, setMode] = useState<MemberAuthMode>(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  // Login state
  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Sign up state
  const [name, setName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirm, setSignupConfirm] = useState('');

  // Activate state
  const [activateEmail, setActivateEmail] = useState('');
  const [activateCode, setActivateCode] = useState('');
  const [activatePassword, setActivatePassword] = useState('');
  const [activateConfirm, setActivateConfirm] = useState('');

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setErrorMsg('');
    setInfoMsg('');
    setShowPassword(false);
    setLoginPassword('');
    setSignupPassword('');
    setSignupConfirm('');
    setActivatePassword('');
    setActivateConfirm('');

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, initialMode, onClose]);

  if (!open) return null;

  function switchMode(next: MemberAuthMode) {
    setMode(next);
    setErrorMsg('');
    setInfoMsg('');
    setShowPassword(false);
  }

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    const trimmedId = identifier.trim();
    if (!trimmedId || !loginPassword) {
      setErrorMsg('Email atau kode anggota dan kata sandi wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/member-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: trimmedId, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.code === 'NEEDS_ACTIVATION') {
          setActivateEmail(data.email || '');
          setActivateCode(data.memberCode || '');
          setActivatePassword('');
          setActivateConfirm('');
          setMode('activate');
          setInfoMsg(
            data.error ||
              'Akun Anda sudah terdaftar namun belum memiliki kata sandi. Tetapkan kata sandi baru di bawah ini.'
          );
          return;
        }
        throw new Error(data.error || 'Gagal masuk ke akun anggota.');
      }
      onSuccess(data.session as SessionInfo);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal masuk ke akun anggota.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignupSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    const trimmedName = name.trim();
    const trimmedEmail = signupEmail.trim();
    const trimmedDept = department.trim();

    if (trimmedName.length < 2) {
      setErrorMsg('Nama lengkap minimal 2 karakter.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMsg('Format alamat email tidak valid.');
      return;
    }
    if (signupPassword.length < 6) {
      setErrorMsg('Kata sandi minimal 6 karakter.');
      return;
    }
    if (signupPassword !== signupConfirm) {
      setErrorMsg('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/member-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          department: trimmedDept || 'Umum',
          password: signupPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Pendaftaran anggota gagal.');
      }
      onSuccess(data.session as SessionInfo, data.sync as LibraryBootstrapPayload | undefined);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Pendaftaran anggota gagal.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleActivateSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    const trimmedEmail = activateEmail.trim();
    const trimmedCode = activateCode.trim().toUpperCase();

    if (!trimmedEmail || !trimmedCode) {
      setErrorMsg('Email dan kode anggota wajib diisi.');
      return;
    }
    if (activatePassword.length < 6) {
      setErrorMsg('Kata sandi baru minimal 6 karakter.');
      return;
    }
    if (activatePassword !== activateConfirm) {
      setErrorMsg('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/member-activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          memberCode: trimmedCode,
          password: activatePassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Aktivasi sandi anggota gagal.');
      }
      onSuccess(data.session as SessionInfo);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Aktivasi sandi anggota gagal.');
    } finally {
      setSubmitting(false);
    }
  }

  const headerTitle =
    mode === 'login'
      ? 'Masuk Akun Anggota'
      : mode === 'signup'
      ? 'Daftar Anggota Baru'
      : 'Aktivasi Sandi Anggota';

  const headerSubtitle =
    mode === 'login'
      ? 'Masuk untuk meminjam buku & mengakses Pinjaman Saya'
      : mode === 'signup'
      ? 'Buat akun keanggotaan digital Kazyfi Library'
      : 'Tetapkan kata sandi pertama bagi anggota terdaftar';

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/50 dark:bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="member-auth-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200/80 dark:border-indigo-800 flex items-center justify-center shrink-0">
              {mode === 'login' ? (
                <LogIn className="w-4 h-4 text-[#1A2B5E] dark:text-indigo-400" />
              ) : mode === 'signup' ? (
                <UserPlus className="w-4 h-4 text-[#1A2B5E] dark:text-indigo-400" />
              ) : (
                <KeyRound className="w-4 h-4 text-[#1A2B5E] dark:text-indigo-400" />
              )}
            </div>
            <div className="min-w-0">
              <h2
                id="member-auth-title"
                className="text-base font-bold text-slate-950 dark:text-slate-50 truncate"
              >
                {headerTitle}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {headerSubtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog autentikasi anggota"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="px-6 pt-4 shrink-0">
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200/70 dark:border-slate-800">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`py-1.5 px-2 text-xs rounded-md transition-all cursor-pointer whitespace-nowrap ${
                mode === 'login'
                  ? 'bg-white dark:bg-[#1B2436] text-[#1A2B5E] dark:text-white font-semibold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-medium'
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={`py-1.5 px-2 text-xs rounded-md transition-all cursor-pointer whitespace-nowrap ${
                mode === 'signup'
                  ? 'bg-white dark:bg-[#1B2436] text-[#1A2B5E] dark:text-white font-semibold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-medium'
              }`}
            >
              Daftar Baru
            </button>
            <button
              type="button"
              onClick={() => switchMode('activate')}
              className={`py-1.5 px-2 text-xs rounded-md transition-all cursor-pointer whitespace-nowrap ${
                mode === 'activate'
                  ? 'bg-white dark:bg-[#1B2436] text-[#1A2B5E] dark:text-white font-semibold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-medium'
              }`}
            >
              Aktivasi Sandi
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {infoMsg && (
            <div className="p-3 rounded-lg bg-indigo-50/80 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-950 dark:text-indigo-200 leading-relaxed">
              {infoMsg}
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

          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="member-login-id"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Email atau Kode Anggota
                </label>
                <input
                  id="member-login-id"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="nama@email.com atau AGT-2026-001"
                  className="w-full px-3.5 py-2 text-sm bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-900/15 focus:border-[#1A2B5E] dark:focus:border-indigo-500"
                />
              </div>

              <div>
                <label
                  htmlFor="member-login-password"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Kata Sandi
                </label>
                <div className="relative">
                  <input
                    id="member-login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Masukkan kata sandi"
                    className="w-full pl-3.5 pr-10 py-2 text-sm bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-900/15 focus:border-[#1A2B5E] dark:focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    aria-label={showPassword ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Belum punya kata sandi namun sudah didaftarkan pustakawan? Gunakan tab{' '}
                <button
                  type="button"
                  onClick={() => switchMode('activate')}
                  className="font-semibold text-[#1A2B5E] dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Aktivasi Sandi
                </button>
                .
              </p>

              <div className="flex items-center justify-between pt-2 gap-3">
                <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>Koneksi terenkripsi</span>
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
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer hover-pop-subtle"
                  >
                    {submitting ? 'Memproses...' : 'Masuk Anggota'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {mode === 'signup' && (
            <form onSubmit={handleSignupSubmit} className="space-y-3.5">
              <div>
                <label
                  htmlFor="member-signup-name"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Nama Lengkap
                </label>
                <input
                  id="member-signup-name"
                  type="text"
                  autoComplete="name"
                  autoFocus
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Siti Rahmawati"
                  className="w-full px-3.5 py-2 text-sm bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-900/15 focus:border-[#1A2B5E] dark:focus:border-indigo-500"
                />
              </div>

              <div>
                <label
                  htmlFor="member-signup-email"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Alamat Email
                </label>
                <input
                  id="member-signup-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  placeholder="nama@instansi.ac.id"
                  className="w-full px-3.5 py-2 text-sm bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-900/15 focus:border-[#1A2B5E] dark:focus:border-indigo-500"
                />
              </div>

              <div>
                <label
                  htmlFor="member-signup-dept"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Fakultas / Jurusan / Unit Kerja
                </label>
                <input
                  id="member-signup-dept"
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="Contoh: Sistem Informasi / Umum"
                  className="w-full px-3.5 py-2 text-sm bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-900/15 focus:border-[#1A2B5E] dark:focus:border-indigo-500"
                />
              </div>

              <div>
                <label
                  htmlFor="member-signup-password"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Kata Sandi (min. 6 karakter)
                </label>
                <div className="relative">
                  <input
                    id="member-signup-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full pl-3.5 pr-10 py-2 text-sm bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-900/15 focus:border-[#1A2B5E] dark:focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    aria-label={showPassword ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="member-signup-confirm"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Konfirmasi Kata Sandi
                </label>
                <input
                  id="member-signup-confirm"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={signupConfirm}
                  onChange={(e) => setSignupConfirm(e.target.value)}
                  placeholder="Ulangi kata sandi"
                  className="w-full px-3.5 py-2 text-sm bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-900/15 focus:border-[#1A2B5E] dark:focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
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
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer hover-pop-subtle"
                >
                  {submitting ? 'Mendaftarkan...' : 'Daftar & Masuk'}
                </button>
              </div>
            </form>
          )}

          {mode === 'activate' && (
            <form onSubmit={handleActivateSubmit} className="space-y-3.5">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Khusus anggota yang didaftarkan oleh Admin pustakawan dan belum pernah membuat kata sandi.
              </p>

              <div>
                <label
                  htmlFor="member-activate-email"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Email Terdaftar
                </label>
                <input
                  id="member-activate-email"
                  type="email"
                  required
                  value={activateEmail}
                  onChange={(e) => setActivateEmail(e.target.value)}
                  placeholder="budi.santoso@kazyfilibrary.id"
                  className="w-full px-3.5 py-2 text-sm bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-900/15 focus:border-[#1A2B5E] dark:focus:border-indigo-500"
                />
              </div>

              <div>
                <label
                  htmlFor="member-activate-code"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Kode Anggota
                </label>
                <input
                  id="member-activate-code"
                  type="text"
                  required
                  value={activateCode}
                  onChange={(e) => setActivateCode(e.target.value.toUpperCase())}
                  placeholder="Contoh: AGT-2026-001"
                  className="w-full px-3.5 py-2 text-sm font-mono bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-900/15 focus:border-[#1A2B5E] dark:focus:border-indigo-500"
                />
              </div>

              <div>
                <label
                  htmlFor="member-activate-password"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Kata Sandi Baru (min. 6 karakter)
                </label>
                <div className="relative">
                  <input
                    id="member-activate-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={activatePassword}
                    onChange={(e) => setActivatePassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full pl-3.5 pr-10 py-2 text-sm bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-900/15 focus:border-[#1A2B5E] dark:focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    aria-label={showPassword ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="member-activate-confirm"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Konfirmasi Kata Sandi Baru
                </label>
                <input
                  id="member-activate-confirm"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={activateConfirm}
                  onChange={(e) => setActivateConfirm(e.target.value)}
                  placeholder="Ulangi kata sandi baru"
                  className="w-full px-3.5 py-2 text-sm bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-900/15 focus:border-[#1A2B5E] dark:focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
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
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer hover-pop-subtle"
                >
                  {submitting ? 'Mengaktifkan...' : 'Aktifkan & Masuk'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
