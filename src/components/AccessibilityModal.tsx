import { Eye, Moon, RotateCcw, Sun, Type, X } from 'lucide-react';
import type { AccessibilityPrefs } from '../types/library';

interface AccessibilityModalProps {
  open: boolean;
  prefs: AccessibilityPrefs;
  onChange: (next: AccessibilityPrefs) => void;
  onClose: () => void;
}

const DEFAULT_PREFS: AccessibilityPrefs = {
  theme: 'light',
  fontScale: 'normal',
  highContrast: false,
  dyslexiaSpacing: false,
};

export function AccessibilityModal({
  open,
  prefs,
  onChange,
  onClose,
}: AccessibilityModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 dark:bg-black/75 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="a11y-modal-title"
    >
      <div className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <Eye className="w-4 h-4 text-[#1A2B5E] dark:text-indigo-400" />
            <h2
              id="a11y-modal-title"
              className="text-base font-bold text-slate-950 dark:text-slate-50"
            >
              Preferensi Tampilan & Aksesibilitas
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pengaturan aksesibilitas"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Theme */}
          <div>
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Mode Tema Antarmuka
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onChange({ ...prefs, theme: 'light' })}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 text-sm font-medium rounded-lg border transition-colors cursor-pointer ${
                  prefs.theme === 'light'
                    ? 'border-[#1A2B5E] bg-indigo-50/80 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-500 font-semibold'
                    : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Sun className="w-4 h-4" />
                <span>Terang</span>
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...prefs, theme: 'dark' })}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 text-sm font-medium rounded-lg border transition-colors cursor-pointer ${
                  prefs.theme === 'dark'
                    ? 'border-[#1A2B5E] bg-indigo-50/80 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-500 font-semibold'
                    : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Moon className="w-4 h-4" />
                <span>Gelap</span>
              </button>
            </div>
          </div>

          {/* Font Scale */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              <Type className="w-3.5 h-3.5 text-slate-500" />
              <span>Ukuran Teks Bacaan</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['normal', 'Normal (100%)'],
                  ['lg', 'Besar (112%)'],
                  ['xl', 'Ekstra (125%)'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => onChange({ ...prefs, fontScale: val })}
                  className={`py-2 px-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    prefs.fontScale === val
                      ? 'border-[#1A2B5E] bg-indigo-50/80 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-500 font-semibold'
                      : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Inclusive Toggles */}
          <div className="space-y-3 pt-1">
            <label className="flex items-start justify-between gap-4 p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Mode Kontras Tinggi
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Mempertegas garis batas panel dan keterbacaan teks untuk penglihatan rendah.
                </div>
              </div>
              <input
                type="checkbox"
                checked={prefs.highContrast}
                onChange={(e) => onChange({ ...prefs, highContrast: e.target.checked })}
                className="w-4 h-4 mt-1 accent-[#1A2B5E] dark:accent-indigo-500 cursor-pointer"
              />
            </label>

            <label className="flex items-start justify-between gap-4 p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Spasi Baca Ramah Disleksia
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Melebarkan jarak antar huruf, kata, dan baris teks agar lebih nyaman dibaca.
                </div>
              </div>
              <input
                type="checkbox"
                checked={prefs.dyslexiaSpacing}
                onChange={(e) => onChange({ ...prefs, dyslexiaSpacing: e.target.checked })}
                className="w-4 h-4 mt-1 accent-[#1A2B5E] dark:accent-indigo-500 cursor-pointer"
              />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200/80 dark:border-slate-800 bg-[#F6F7FA]/80 dark:bg-[#0B0F17]/60">
          <button
            type="button"
            onClick={() => onChange(DEFAULT_PREFS)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Standar</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer"
          >
            Terapkan
          </button>
        </div>
      </div>
    </div>
  );
}
