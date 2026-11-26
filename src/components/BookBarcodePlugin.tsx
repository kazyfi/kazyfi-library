import JsBarcode from 'jsbarcode';
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  FileImage,
  Layers,
  Printer,
  RefreshCw,
  ScanBarcode,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Book } from '../types/library';

export type BarcodeFormat = 'EAN13' | 'CODE128' | 'CODE39';
type SourceMode = 'catalog' | 'batch' | 'custom';
type StickerSize = 'compact' | 'standard' | 'wide';

interface BookBarcodePluginProps {
  books: Book[];
  initialBookId?: string | null;
}

interface BarcodeStickerItem {
  id: string;
  code: string;
  title: string;
  author: string;
  shelfCode: string;
  isbn: string;
  copyLabel: string | null;
}

interface BarcodeSvgProps {
  value: string;
  format: BarcodeFormat;
  lineWidth: number;
  height: number;
  displayValue: boolean;
  onValidityChange?: (valid: boolean) => void;
  svgRefExternal?: (el: SVGSVGElement | null) => void;
}

function normalizeBarcodeValue(raw: string, format: BarcodeFormat): string {
  const trimmed = raw.trim();
  if (format === 'EAN13') {
    const digits = trimmed.replace(/\D/g, '');
    return digits;
  }
  if (format === 'CODE39') {
    return trimmed
      .toUpperCase()
      .replace(/[^A-Z0-9\-.\s$/+%]/g, '');
  }
  // CODE128 supports ASCII printable characters
  return trimmed.replace(/[^\x20-\x7E]/g, '');
}

function BarcodeSvg({
  value,
  format,
  lineWidth,
  height,
  displayValue,
  onValidityChange,
  svgRefExternal,
}: BarcodeSvgProps) {
  const localRef = useRef<SVGSVGElement | null>(null);
  const [isValid, setIsValid] = useState(true);

  useEffect(() => {
    const svg = localRef.current;
    if (!svg) return;

    const cleanVal = normalizeBarcodeValue(value, format);
    if (!cleanVal) {
      svg.innerHTML = '';
      setIsValid(false);
      onValidityChange?.(false);
      return;
    }

    if (format === 'EAN13' && cleanVal.length !== 12 && cleanVal.length !== 13) {
      svg.innerHTML = '';
      setIsValid(false);
      onValidityChange?.(false);
      return;
    }

    let validResult = true;
    try {
      JsBarcode(svg, cleanVal, {
        format,
        width: lineWidth,
        height,
        displayValue,
        fontSize: 12,
        font: 'IBM Plex Mono, ui-monospace, monospace',
        textMargin: 4,
        margin: 6,
        background: '#ffffff',
        lineColor: '#0f172a',
        valid: (valid) => {
          validResult = valid;
        },
      });
      setIsValid(validResult);
      onValidityChange?.(validResult);
    } catch {
      svg.innerHTML = '';
      setIsValid(false);
      onValidityChange?.(false);
    }
  }, [value, format, lineWidth, height, displayValue, onValidityChange]);

  const setRefs = (el: SVGSVGElement | null) => {
    localRef.current = el;
    svgRefExternal?.(el);
  };

  return (
    <div className="w-full flex flex-col items-center justify-center min-h-[68px]">
      <svg
        ref={setRefs}
        className={`max-w-full h-auto ${isValid ? 'block' : 'hidden'}`}
        role="img"
        aria-label={`Barcode ${format} untuk ${value}`}
      />
      {!isValid && (
        <div className="w-full py-3 px-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2 text-left">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <span>
            {format === 'EAN13'
              ? 'Format EAN-13 memerlukan 12 atau 13 digit angka ISBN yang valid (checksum sesuai standar).'
              : 'Nilai kode tidak valid untuk format barcode ini.'}
          </span>
        </div>
      )}
    </div>
  );
}

export function BookBarcodePlugin({ books, initialBookId }: BookBarcodePluginProps) {
  const [sourceMode, setSourceMode] = useState<SourceMode>('catalog');
  const [selectedBookId, setSelectedBookId] = useState<string>(
    initialBookId || books[0]?.id || ''
  );
  const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>(() =>
    books.slice(0, 4).map((b) => b.id)
  );
  const [generateAllCopies, setGenerateAllCopies] = useState(false);

  const [format, setFormat] = useState<BarcodeFormat>('EAN13');
  const [stickerSize, setStickerSize] = useState<StickerSize>('standard');
  const [lineWidth, setLineWidth] = useState<number>(1.8);
  const [barHeight, setBarHeight] = useState<number>(54);

  const [showLibraryHeader, setShowLibraryHeader] = useState(true);
  const [showTitle, setShowTitle] = useState(true);
  const [showAuthor, setShowAuthor] = useState(true);
  const [showShelfCode, setShowShelfCode] = useState(true);
  const [showCopyBadge, setShowCopyBadge] = useState(true);
  const [displayValue, setDisplayValue] = useState(true);

  const [customForm, setCustomForm] = useState({
    title: 'Koleksi Baru Kazyfi Library',
    author: 'Tim Kurasi Pustaka',
    code: '9786237120845',
    shelfCode: 'RAK-A1',
    quantity: 3,
  });

  const [copiedCode, setCopiedCode] = useState(false);
  const [firstStickerValid, setFirstStickerValid] = useState(true);
  const primarySvgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (initialBookId && books.some((b) => b.id === initialBookId)) {
      setSelectedBookId(initialBookId);
      setSourceMode('catalog');
    } else if (!selectedBookId && books.length > 0) {
      setSelectedBookId(books[0].id);
    }
  }, [initialBookId, books, selectedBookId]);

  const selectedBook = useMemo(
    () => books.find((b) => b.id === selectedBookId) ?? books[0] ?? null,
    [books, selectedBookId]
  );

  const stickers: BarcodeStickerItem[] = useMemo(() => {
    if (sourceMode === 'custom') {
      const qty = Math.min(24, Math.max(1, Number(customForm.quantity) || 1));
      const baseCode = customForm.code.trim() || '9786230000011';
      return Array.from({ length: qty }, (_, idx) => {
        const copyNum = String(idx + 1).padStart(2, '0');
        const code =
          qty > 1 && format !== 'EAN13' ? `${baseCode}-${copyNum}` : baseCode;
        return {
          id: `custom-${idx}`,
          code,
          title: customForm.title || 'Koleksi Kustom',
          author: customForm.author || 'Kazyfi Library',
          shelfCode: customForm.shelfCode || 'RAK-UMUM',
          isbn: baseCode,
          copyLabel: qty > 1 ? `Eks. ${idx + 1}/${qty}` : null,
        };
      });
    }

    if (sourceMode === 'batch') {
      const chosenBooks = books.filter((b) => batchSelectedIds.includes(b.id));
      const items: BarcodeStickerItem[] = [];
      for (const b of chosenBooks) {
        const baseVal =
          format === 'EAN13'
            ? b.isbn.replace(/\D/g, '')
            : b.barcodeCode || b.isbn.replace(/[^0-9A-Za-z]/g, '');
        if (generateAllCopies) {
          const count = Math.min(12, Math.max(1, b.totalCopies));
          for (let i = 0; i < count; i += 1) {
            const copyCode =
              format === 'EAN13'
                ? baseVal
                : `${baseVal}-${String(i + 1).padStart(2, '0')}`;
            items.push({
              id: `${b.id}-c${i + 1}`,
              code: copyCode,
              title: b.title,
              author: b.author,
              shelfCode: b.shelfCode,
              isbn: b.isbn,
              copyLabel: `Eks. ${i + 1}/${b.totalCopies}`,
            });
          }
        } else {
          items.push({
            id: b.id,
            code: baseVal,
            title: b.title,
            author: b.author,
            shelfCode: b.shelfCode,
            isbn: b.isbn,
            copyLabel: `${b.totalCopies} eks.`,
          });
        }
      }
      return items;
    }

    // Catalog single-book mode
    if (!selectedBook) return [];
    const baseVal =
      format === 'EAN13'
        ? selectedBook.isbn.replace(/\D/g, '')
        : selectedBook.barcodeCode || selectedBook.isbn.replace(/[^0-9A-Za-z]/g, '');

    if (generateAllCopies) {
      const count = Math.min(24, Math.max(1, selectedBook.totalCopies));
      return Array.from({ length: count }, (_, i) => ({
        id: `${selectedBook.id}-copy-${i + 1}`,
        code:
          format === 'EAN13'
            ? baseVal
            : `${baseVal}-${String(i + 1).padStart(2, '0')}`,
        title: selectedBook.title,
        author: selectedBook.author,
        shelfCode: selectedBook.shelfCode,
        isbn: selectedBook.isbn,
        copyLabel: `Eks. ${i + 1}/${selectedBook.totalCopies}`,
      }));
    }

    return [
      {
        id: `${selectedBook.id}-master`,
        code: baseVal,
        title: selectedBook.title,
        author: selectedBook.author,
        shelfCode: selectedBook.shelfCode,
        isbn: selectedBook.isbn,
        copyLabel: `${selectedBook.totalCopies} eks.`,
      },
    ];
  }, [
    sourceMode,
    selectedBook,
    books,
    batchSelectedIds,
    generateAllCopies,
    format,
    customForm,
  ]);

  const primarySticker = stickers[0] ?? null;

  function toggleBatchBook(bookId: string) {
    setBatchSelectedIds((prev) =>
      prev.includes(bookId) ? prev.filter((id) => id !== bookId) : [...prev, bookId]
    );
  }

  function handleCopyPrimaryCode() {
    if (!primarySticker) return;
    navigator.clipboard?.writeText(primarySticker.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  }

  function handleDownloadSvg() {
    const svg = primarySvgRef.current;
    if (!svg || !primarySticker || !firstStickerValid) return;

    const serializer = new XMLSerializer();
    const svgMarkup = serializer.serializeToString(svg);
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `barcode-${primarySticker.code.replace(/[^a-zA-Z0-9-_]/g, '')}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleDownloadPng() {
    const svg = primarySvgRef.current;
    if (!svg || !primarySticker || !firstStickerValid) return;

    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const scale = 3;
      const padX = 24;
      const headerHeight = showLibraryHeader || showTitle ? 48 : 16;
      const footerHeight = showAuthor || showShelfCode ? 28 : 16;
      const width = Math.max(img.width + padX * 2, 300);
      const height = img.height + headerHeight + footerHeight;

      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        return;
      }

      ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

      let yCursor = 16;
      if (showLibraryHeader) {
        ctx.fillStyle = '#1A2B5E';
        ctx.font = 'bold 10px Helvetica, Arial, sans-serif';
        ctx.fillText('KAZYFI LIBRARY', 14, yCursor);
        if (showShelfCode) {
          ctx.fillStyle = '#475569';
          ctx.font = 'bold 10px monospace';
          const shelfText = primarySticker.shelfCode;
          const m = ctx.measureText(shelfText);
          ctx.fillText(shelfText, width - 14 - m.width, yCursor);
        }
        yCursor += 14;
      }

      if (showTitle) {
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 12px Helvetica, Arial, sans-serif';
        const truncatedTitle =
          primarySticker.title.length > 36
            ? `${primarySticker.title.slice(0, 35)}…`
            : primarySticker.title;
        ctx.fillText(truncatedTitle, 14, yCursor + 2);
      }

      const imgX = (width - img.width) / 2;
      ctx.drawImage(img, imgX, headerHeight);

      if (showAuthor || (showCopyBadge && primarySticker.copyLabel)) {
        ctx.fillStyle = '#64748b';
        ctx.font = '10px Helvetica, Arial, sans-serif';
        const footerLeft = showAuthor ? primarySticker.author : '';
        ctx.fillText(footerLeft.slice(0, 30), 14, height - 10);
        if (showCopyBadge && primarySticker.copyLabel) {
          ctx.font = 'bold 10px monospace';
          const copyText = primarySticker.copyLabel;
          const cm = ctx.measureText(copyText);
          ctx.fillText(copyText, width - 14 - cm.width, height - 10);
        }
      }

      canvas.toBlob((pngBlob) => {
        if (pngBlob) {
          const pngUrl = URL.createObjectURL(pngBlob);
          const a = document.createElement('a');
          a.href = pngUrl;
          a.download = `barcode-${primarySticker.code.replace(/[^a-zA-Z0-9-_]/g, '')}.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(pngUrl);
        }
        URL.revokeObjectURL(url);
      }, 'image/png');
    };
    img.src = url;
  }

  function handleRandomizeCustomCode() {
    const prefix = '978623';
    const body = String(Math.floor(100000 + Math.random() * 899999));
    const digits12 = `${prefix}${body}`;
    // Compute EAN-13 check digit
    let sum = 0;
    for (let i = 0; i < 12; i += 1) {
      const d = Number(digits12[i]);
      sum += i % 2 === 0 ? d : d * 3;
    }
    const check = (10 - (sum % 10)) % 10;
    setCustomForm((prev) => ({ ...prev, code: `${digits12}${check}` }));
  }

  const gridColsClass =
    stickerSize === 'compact'
      ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
      : stickerSize === 'standard'
      ? 'grid-cols-1 sm:grid-cols-2'
      : 'grid-cols-1';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="no-print flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200/90 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-slate-950 dark:text-slate-50">
              Plugin Barcode Buku
            </h1>
            <span className="px-2 py-0.5 text-[11px] font-mono font-semibold uppercase tracking-wide rounded-md bg-indigo-50 text-[#1A2B5E] border border-indigo-200/80 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800">
              JsBarcode Engine
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Buat, kustomisasi, ekspor SVG/PNG, dan cetak stiker barcode EAN-13, CODE 128, atau CODE 39 untuk koleksi buku fisik.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={!primarySticker || !firstStickerValid}
            onClick={handleDownloadSvg}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#111723] border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Unduh SVG</span>
          </button>
          <button
            type="button"
            disabled={!primarySticker || !firstStickerValid}
            onClick={handleDownloadPng}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#111723] border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileImage className="w-3.5 h-3.5" />
            <span>Unduh PNG</span>
          </button>
          <button
            type="button"
            disabled={stickers.length === 0}
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak Label ({stickers.length})</span>
          </button>
        </div>
      </div>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Control Panel */}
        <div className="no-print lg:col-span-5 space-y-5">
          {/* Source Selector */}
          <div className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div>
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                1. Sumber Data Buku
              </span>
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200/60 dark:border-slate-800">
                {(
                  [
                    ['catalog', 'Satu Buku'],
                    ['batch', 'Multi-Buku'],
                    ['custom', 'Input Kustom'],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSourceMode(mode)}
                    className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      sourceMode === mode
                        ? 'bg-white dark:bg-[#1B2436] text-indigo-950 dark:text-white shadow-xs font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {sourceMode === 'catalog' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Pilih Buku dari Katalog
                  </label>
                  <select
                    value={selectedBook?.id ?? ''}
                    onChange={(e) => setSelectedBookId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#1A2B5E] dark:focus:border-indigo-500"
                  >
                    {books.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title} · {b.isbn}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedBook && (
                  <div className="p-3 rounded-lg bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200/80 dark:border-slate-800 text-xs space-y-1">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {selectedBook.title}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {selectedBook.author} · Rak {selectedBook.shelfCode} · {selectedBook.totalCopies} eksemplar
                    </div>
                  </div>
                )}

                <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={generateAllCopies}
                    onChange={(e) => setGenerateAllCopies(e.target.checked)}
                    className="w-4 h-4 accent-[#1A2B5E] dark:accent-indigo-500 rounded"
                  />
                  <span>
                    Buat label terpisah untuk setiap eksemplar ({selectedBook?.totalCopies ?? 1} stiker)
                  </span>
                </label>
              </div>
            )}

            {sourceMode === 'batch' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Centang Buku ({batchSelectedIds.length} dipilih)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setBatchSelectedIds(books.map((b) => b.id))}
                      className="text-[#1A2B5E] dark:text-indigo-400 font-medium hover:underline cursor-pointer"
                    >
                      Pilih Semua
                    </button>
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <button
                      type="button"
                      onClick={() => setBatchSelectedIds([])}
                      className="text-slate-500 hover:underline cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                  {books.map((b) => {
                    const checked = batchSelectedIds.includes(b.id);
                    return (
                      <label
                        key={b.id}
                        className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBatchBook(b.id)}
                          className="w-4 h-4 accent-[#1A2B5E] dark:accent-indigo-500 rounded shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                            {b.title}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {b.isbn} · {b.shelfCode} · {b.totalCopies} eks.
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={generateAllCopies}
                    onChange={(e) => setGenerateAllCopies(e.target.checked)}
                    className="w-4 h-4 accent-[#1A2B5E] dark:accent-indigo-500 rounded"
                  />
                  <span>Gandakan sesuai total eksemplar masing-masing buku</span>
                </label>
              </div>
            )}

            {sourceMode === 'custom' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Kode ISBN / Nomor Barcode
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customForm.code}
                      onChange={(e) => setCustomForm({ ...customForm, code: e.target.value })}
                      placeholder="9786237120845 atau KZ-BK-001"
                      className="flex-1 px-3 py-2 text-sm font-mono bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#1A2B5E] dark:focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={handleRandomizeCustomCode}
                      title="Generate ISBN-13 Acak Valid"
                      className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-[#F6F7FA] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 rounded-lg inline-flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Acak</span>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Judul Buku pada Label
                  </label>
                  <input
                    type="text"
                    value={customForm.title}
                    onChange={(e) => setCustomForm({ ...customForm, title: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#1A2B5E] dark:focus:border-indigo-500"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="col-span-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Kode Rak
                    </label>
                    <input
                      type="text"
                      value={customForm.shelfCode}
                      onChange={(e) =>
                        setCustomForm({ ...customForm, shelfCode: e.target.value })
                      }
                      className="w-full px-2.5 py-2 text-xs font-mono bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#1A2B5E] dark:focus:border-indigo-500"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Penulis
                    </label>
                    <input
                      type="text"
                      value={customForm.author}
                      onChange={(e) => setCustomForm({ ...customForm, author: e.target.value })}
                      className="w-full px-2.5 py-2 text-xs bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#1A2B5E] dark:focus:border-indigo-500"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Jumlah Label
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={customForm.quantity}
                      onChange={(e) =>
                        setCustomForm({ ...customForm, quantity: Number(e.target.value) })
                      }
                      className="w-full px-2.5 py-2 text-xs font-mono tabular-nums bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#1A2B5E] dark:focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Barcode Format & Dimensions */}
          <div className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              2. Standar & Kustomisasi Barcode
            </span>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['EAN13', 'EAN-13', 'ISBN Resmi'],
                  ['CODE128', 'CODE 128', 'Alfanumerik'],
                  ['CODE39', 'CODE 39', 'Katalog Klasik'],
                ] as const
              ).map(([fmt, title, desc]) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setFormat(fmt)}
                  className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    format === fmt
                      ? 'border-[#1A2B5E] bg-indigo-50/80 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-500'
                      : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="text-xs font-bold font-mono">{title}</div>
                  <div className="text-[11px] opacity-75 mt-0.5">{desc}</div>
                </button>
              ))}
            </div>

            {!firstStickerValid && format === 'EAN13' && (
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs">
                <span className="text-indigo-950 dark:text-indigo-200">
                  Ingin mencetak kode inventaris bebas/alfanumerik?
                </span>
                <button
                  type="button"
                  onClick={() => setFormat('CODE128')}
                  className="px-2.5 py-1 rounded-md bg-[#1A2B5E] text-white font-semibold shrink-0 cursor-pointer"
                >
                  Pakai CODE 128
                </button>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Ukuran Stiker Label
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['compact', '38×25 mm'],
                    ['standard', '50×30 mm'],
                    ['wide', '70×38 mm'],
                  ] as const
                ).map(([sz, label]) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setStickerSize(sz)}
                    className={`py-1.5 px-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                      stickerSize === sz
                        ? 'border-[#1A2B5E] bg-indigo-50/80 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-500'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Ketebalan Batang</span>
                  <span className="font-mono tabular-nums text-slate-500">{lineWidth}px</span>
                </div>
                <input
                  type="range"
                  min={1.2}
                  max={2.4}
                  step={0.2}
                  value={lineWidth}
                  onChange={(e) => setLineWidth(Number(e.target.value))}
                  className="w-full accent-[#1A2B5E] dark:accent-indigo-500"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Tinggi Batang</span>
                  <span className="font-mono tabular-nums text-slate-500">{barHeight}px</span>
                </div>
                <input
                  type="range"
                  min={36}
                  max={76}
                  step={4}
                  value={barHeight}
                  onChange={(e) => setBarHeight(Number(e.target.value))}
                  className="w-full accent-[#1A2B5E] dark:accent-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              {[
                ['Header Kazyfi Library', showLibraryHeader, setShowLibraryHeader],
                ['Judul Buku', showTitle, setShowTitle],
                ['Nama Penulis', showAuthor, setShowAuthor],
                ['Kode Rak', showShelfCode, setShowShelfCode],
                ['Nomor Salinan', showCopyBadge, setShowCopyBadge],
                ['Angka Barcode', displayValue, setDisplayValue],
              ].map(([label, val, setter]) => (
                <label
                  key={label as string}
                  className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={val as boolean}
                    onChange={(e) => (setter as (v: boolean) => void)(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[#1A2B5E] dark:accent-indigo-500 rounded"
                  />
                  <span>{label as string}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Right Live Preview & Printable Sheet */}
        <div className="lg:col-span-7 space-y-4">
          <div className="no-print bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs">
              <ScanBarcode className="w-4 h-4 text-[#1A2B5E] dark:text-indigo-400" />
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                Pratinjau Stiker Siap Cetak
              </span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {stickers.length} label · Format {format}
              </span>
            </div>

            {primarySticker && (
              <button
                type="button"
                onClick={handleCopyPrimaryCode}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono text-slate-700 dark:text-slate-200 bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>{primarySticker.code}</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Printable Sticker Canvas */}
          <div className="bg-slate-100/80 dark:bg-[#0D1320] border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6">
            {stickers.length > 0 ? (
              <div className={`grid ${gridColsClass} gap-4`}>
                {stickers.map((item, idx) => (
                  <div
                    key={item.id}
                    className="barcode-sticker bg-white border border-slate-300 rounded-lg p-3.5 shadow-xs flex flex-col justify-between text-slate-900"
                  >
                    {(showLibraryHeader || showTitle || showShelfCode) && (
                      <div className="mb-1.5 space-y-0.5">
                        {(showLibraryHeader || showShelfCode) && (
                          <div className="flex items-center justify-between gap-2 text-[10px]">
                            {showLibraryHeader ? (
                              <span className="font-bold tracking-wider uppercase text-[#1A2B5E]">
                                KAZYFI LIBRARY
                              </span>
                            ) : (
                              <span />
                            )}
                            {showShelfCode && (
                              <span className="font-mono font-semibold text-slate-600">
                                {item.shelfCode}
                              </span>
                            )}
                          </div>
                        )}
                        {showTitle && (
                          <div className="text-xs font-bold text-slate-950 leading-snug line-clamp-1">
                            {item.title}
                          </div>
                        )}
                      </div>
                    )}

                    <BarcodeSvg
                      value={item.code}
                      format={format}
                      lineWidth={lineWidth}
                      height={barHeight}
                      displayValue={displayValue}
                      onValidityChange={idx === 0 ? setFirstStickerValid : undefined}
                      svgRefExternal={
                        idx === 0
                          ? (el) => {
                              primarySvgRef.current = el;
                            }
                          : undefined
                      }
                    />

                    {(showAuthor || (showCopyBadge && item.copyLabel)) && (
                      <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2 text-[10px] text-slate-500">
                        <span className="truncate">
                          {showAuthor ? item.author : ''}
                        </span>
                        {showCopyBadge && item.copyLabel && (
                          <span className="font-mono font-semibold text-slate-700 shrink-0">
                            {item.copyLabel}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center space-y-2 text-slate-500 dark:text-slate-400">
                <Layers className="w-8 h-8 mx-auto opacity-50" />
                <p className="text-sm font-medium">
                  Pilih minimal satu buku untuk menampilkan pratinjau barcode.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
