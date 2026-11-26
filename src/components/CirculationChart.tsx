import { useState } from 'react';
import type { DailyCirculationPoint } from '../types/library';

interface CirculationChartProps {
  data: DailyCirculationPoint[];
}

export function CirculationChart({ data }: CirculationChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const maxVal = Math.max(
    4,
    ...data.map((d) => Math.max(d.borrowed, d.returned))
  );

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Tren Sirkulasi 7 Hari Terakhir
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Perbandingan volume peminjaman dan pengembalian harian
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-blue-700 inline-block rounded-xs" />
            <span>Dipinjam</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-emerald-600 inline-block rounded-xs" />
            <span>Dikembalikan</span>
          </div>
        </div>
      </div>

      <div className="relative h-52 flex items-end gap-3 pt-6 pb-2 border-b border-slate-200">
        {/* Horizontal reference lines */}
        <div className="absolute inset-x-0 top-6 bottom-2 flex flex-col justify-between pointer-events-none">
          {[maxVal, Math.ceil(maxVal / 2), 0].map((tick, idx) => (
            <div key={idx} className="flex items-center w-full">
              <span className="text-[11px] font-mono tabular-nums text-slate-400 w-6 text-right pr-2">
                {tick}
              </span>
              <div className="flex-1 border-t border-dashed border-slate-200/80" />
            </div>
          ))}
        </div>

        {/* Bars */}
        <div className="relative z-10 flex-1 pl-7 grid grid-cols-7 gap-2 sm:gap-4 h-full items-end">
          {data.map((point, index) => {
            const borrowHeight = Math.round((point.borrowed / maxVal) * 100);
            const returnHeight = Math.round((point.returned / maxVal) * 100);
            const isHovered = hoveredIdx === index;

            return (
              <div
                key={point.date}
                onMouseEnter={() => setHoveredIdx(index)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="relative flex flex-col items-center justify-end h-full group cursor-default"
              >
                {isHovered && (
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-900 text-white text-[11px] font-mono tabular-nums px-2 py-1 rounded shadow-sm z-20">
                    Pinjam: {point.borrowed} · Kembali: {point.returned}
                  </div>
                )}
                <div className="w-full flex items-end justify-center gap-1 sm:gap-1.5 h-full pt-2">
                  <div
                    style={{ height: `${Math.max(point.borrowed > 0 ? 8 : 2, borrowHeight)}%` }}
                    className={`w-3 sm:w-4 rounded-t-xs transition-all duration-150 ${
                      isHovered ? 'bg-blue-800' : 'bg-blue-700'
                    }`}
                  />
                  <div
                    style={{ height: `${Math.max(point.returned > 0 ? 8 : 2, returnHeight)}%` }}
                    className={`w-3 sm:w-4 rounded-t-xs transition-all duration-150 ${
                      isHovered ? 'bg-emerald-700' : 'bg-emerald-600'
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* X-Axis Labels */}
      <div className="pl-7 grid grid-cols-7 gap-2 sm:gap-4 pt-2">
        {data.map((point) => (
          <div key={point.date} className="text-center text-[11px] font-mono tabular-nums text-slate-500 truncate">
            {point.label}
          </div>
        ))}
      </div>
    </div>
  );
}
