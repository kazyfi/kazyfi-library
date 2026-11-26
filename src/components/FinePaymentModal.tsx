import QRCode from 'qrcode';
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ImagePlus,
  QrCode,
  Receipt,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FinePaymentMethod, Loan } from '../types/library';
import { formatDateTimeId, formatRupiah } from '../utils/format';

export interface SubmitFineProofPayload {
  method: FinePaymentMethod;
  channelLabel: string;
  referenceCode: string;
  proofImageDataUrl: string;
  proofFileName: string;
  payerName: string;
  notes?: string;
}

interface FinePaymentModalProps {
  loan: Loan | null;
  memberName: string;
  onClose: () => void;
  onSubmit: (loanId: string, payload: SubmitFineProofPayload) => Promise<void>;
}

const BANK_ACCOUNTS = [
  {
    id: 'bca',
    bank: 'Bank BCA',
    accountNumber: '731-094-2810',
    rawNumber: '7310942810',
    holder: 'Yayasan Kazyfi Library',
  },
  {
    id: 'mandiri',
    bank: 'Bank Mandiri',
    accountNumber: '137-00-8841209-4',
    rawNumber: '1370088412094',
    holder: 'Kazyfi Library Digital',
  },
  {
    id: 'bri',
    bank: 'Bank BRI',
    accountNumber: '0341-01-009281-50-7',
    rawNumber: '034101009281507',
    holder: 'Kazyfi Library',
  },
] as const;

const QRIS_MERCHANT_NAME = 'KAZYFI, DIGITAL & KREATIF';
const QRIS_NMID = 'ID1026538045430';
const QRIS_TERMINAL_LABEL = 'A01';
const QRIS_PRINTED_BY = '93600914';
const QRIS_POSTER_ASSET_URL = '/assets/aistudio/WhatsApp_Image_2026-11-26_at_19.17.26_acd55ce3.jpeg';
const QRIS_STATIC_BASE_PAYLOAD =
  '00020101021126610014COM.GO-JEK.WWW01189360091434552290380210G4552290380303UMI51440014ID.CO.QRIS.WWW0215ID10265380454300303UMI5204899953033605802ID5925Kazyfi, Digital & Kreatif6013JAKARTA TIMUR61051351062070703A0163048B54';

function computeCrc16Ccitt(payloadWithoutChecksum: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payloadWithoutChecksum.length; i++) {
    crc ^= payloadWithoutChecksum.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function buildDynamicQrisPayload(baseStaticQris: string, amountRupiah: number): string {
  const tags: Array<{ tag: string; value: string }> = [];
  let cursor = 0;
  while (cursor + 4 <= baseStaticQris.length) {
    const tag = baseStaticQris.slice(cursor, cursor + 2);
    const len = Number.parseInt(baseStaticQris.slice(cursor + 2, cursor + 4), 10);
    if (!Number.isFinite(len) || len < 0 || cursor + 4 + len > baseStaticQris.length) {
      break;
    }
    const value = baseStaticQris.slice(cursor + 4, cursor + 4 + len);
    cursor += 4 + len;
    if (tag === '63' || tag === '54') continue;
    tags.push({ tag, value });
  }

  const normalizedAmount = Math.max(0, Math.round(amountRupiah));
  const resultTags: Array<{ tag: string; value: string }> = [];
  let amountInserted = false;

  for (const item of tags) {
    if (item.tag === '01') {
      resultTags.push({ tag: '01', value: normalizedAmount > 0 ? '12' : '11' });
      continue;
    }
    if (!amountInserted && normalizedAmount > 0 && Number(item.tag) > 54) {
      resultTags.push({ tag: '54', value: String(normalizedAmount) });
      amountInserted = true;
    }
    resultTags.push(item);
  }

  if (!amountInserted && normalizedAmount > 0) {
    resultTags.push({ tag: '54', value: String(normalizedAmount) });
  }

  const body =
    resultTags
      .map(({ tag, value }) => `${tag}${String(value.length).padStart(2, '0')}${value}`)
      .join('') + '6304';

  return body + computeCrc16Ccitt(body);
}

function isSafeImageDataUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  return /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(url);
}

async function compressImageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak dapat diproses.'));
      img.onload = () => {
        const maxWidth = 960;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas browser tidak tersedia.'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const compressed = canvas.toDataURL('image/jpeg', 0.82);
        if (compressed.length > 620_000) {
          resolve(canvas.toDataURL('image/jpeg', 0.65));
        } else {
          resolve(compressed);
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function FinePaymentModal({
  loan,
  memberName,
  onClose,
  onSubmit,
}: FinePaymentModalProps) {
  const [method, setMethod] = useState<FinePaymentMethod>('bank_transfer');
  const [selectedBankId, setSelectedBankId] = useState<string>(BANK_ACCOUNTS[0].id);
  const [payerName, setPayerName] = useState(memberName);
  const [referenceCode, setReferenceCode] = useState('');
  const [notes, setNotes] = useState('');
  const [proofImageDataUrl, setProofImageDataUrl] = useState('');
  const [proofFileName, setProofFileName] = useState('');
  const [qrisDataUrl, setQrisDataUrl] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [viewProofOnly, setViewProofOnly] = useState(false);
  const [showOriginalPoster, setShowOriginalPoster] = useState(false);

  const selectedBank = useMemo(
    () => BANK_ACCOUNTS.find((b) => b.id === selectedBankId) ?? BANK_ACCOUNTS[0],
    [selectedBankId]
  );

  // Reset modal fields when opening a different loan
  useEffect(() => {
    if (!loan) return;
    const existing = loan.finePaymentProof;
    setMethod(existing?.method ?? 'bank_transfer');
    setPayerName(existing?.payerName ?? memberName);
    setReferenceCode(existing?.referenceCode ?? '');
    setNotes(existing?.notes ?? '');
    setProofImageDataUrl(existing?.proofImageDataUrl ?? '');
    setProofFileName(existing?.proofFileName ?? '');
    setFileError(null);
    setShowOriginalPoster(false);
    setViewProofOnly(
      Boolean(
        existing &&
          (loan.finePaymentStatus === 'pending_verification' ||
            loan.finePaymentStatus === 'verified' ||
            loan.finePaid)
      )
    );
  }, [loan, memberName]);

  // Generate dynamic EMVCo QRIS from Kazyfi's official static QRIS with fineAmount pre-filled
  useEffect(() => {
    if (!loan) {
      setQrisDataUrl('');
      return;
    }
    const qrisPayload = buildDynamicQrisPayload(QRIS_STATIC_BASE_PAYLOAD, loan.fineAmount);

    QRCode.toDataURL(qrisPayload, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => setQrisDataUrl(url))
      .catch(() => setQrisDataUrl(''));
  }, [loan]);

  if (!loan) return null;

  function handleCopy(key: string, value: string) {
    navigator.clipboard?.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setFileError('Harap pilih file gambar berformat PNG, JPG, atau WEBP.');
      return;
    }

    try {
      const compressed = await compressImageFileToDataUrl(file);
      if (!isSafeImageDataUrl(compressed) || compressed.length > 640_000) {
        setFileError('Ukuran gambar terlalu besar setelah dikompresi. Gunakan gambar lain.');
        return;
      }
      setProofImageDataUrl(compressed);
      setProofFileName(file.name);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Gagal memproses gambar bukti.');
    }
  }

  function handleDownloadQris() {
    if (!qrisDataUrl || !loan) return;
    const a = document.createElement('a');
    a.href = qrisDataUrl;
    a.download = `QRIS-Kazyfi-${loan.loanCode}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!loan) return;
    if (!proofImageDataUrl) {
      setFileError('Silakan unggah foto atau tangkapan layar bukti pembayaran terlebih dahulu.');
      return;
    }

    setSubmitting(true);
    setFileError(null);
    try {
      const channelLabel =
        method === 'qris'
          ? `QRIS · ${QRIS_NMID}`
          : `${selectedBank.bank} · ${selectedBank.accountNumber}`;
      await onSubmit(loan.id, {
        method,
        channelLabel,
        referenceCode: referenceCode.trim(),
        proofImageDataUrl,
        proofFileName: proofFileName || 'bukti-bayar.jpg',
        payerName: payerName.trim() || memberName,
        notes: notes.trim() || undefined,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  const existingProof = loan.finePaymentProof;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="fine-payment-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 dark:bg-black/75 backdrop-blur-xs p-4"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        className="bg-white dark:bg-[#111723] border border-slate-200/90 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#1A2B5E] dark:bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="fine-payment-modal-title"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                {viewProofOnly ? 'Bukti Pembayaran Denda' : 'Pembayaran Denda Keterlambatan'}
              </h2>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                {loan.loanCode} · {loan.bookTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            aria-label="Tutup modal pembayaran denda"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Amount Summary Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-[#F6F7FA] dark:bg-[#0B0F17] border border-slate-200/90 dark:border-slate-800">
            <div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
                Total Tagihan Denda
              </span>
              <span className="text-2xl font-bold font-mono tabular-nums text-red-600 dark:text-red-400">
                {formatRupiah(loan.fineAmount)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {loan.finePaid ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Lunas Terverifikasi
                </span>
              ) : loan.finePaymentStatus === 'pending_verification' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  <Clock className="w-3.5 h-3.5" />
                  Menunggu Verifikasi Admin
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleCopy('amount', String(loan.fineAmount))}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  {copiedKey === 'amount' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Nominal Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>Salin Nominal</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Rejected Notice */}
          {loan.finePaymentStatus === 'rejected' && existingProof?.rejectionReason && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 flex items-start gap-2.5 text-xs text-red-800 dark:text-red-200">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Bukti sebelumnya ditolak oleh Admin</div>
                <p className="mt-0.5">{existingProof.rejectionReason}</p>
              </div>
            </div>
          )}

          {/* Read-only Proof View when already submitted/verified */}
          {viewProofOnly && existingProof ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs p-4 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0D1320]">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Metode Pembayaran</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {existingProof.method === 'qris' ? 'QRIS Instan' : 'Transfer Rekening Bank'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Tujuan</span>
                  <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                    {existingProof.channelLabel}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">No. Referensi</span>
                  <span className="font-mono font-semibold text-[#1A2B5E] dark:text-indigo-400">
                    {existingProof.referenceCode}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Nama Pengirim</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {existingProof.payerName}
                  </span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-500 dark:text-slate-400 block">Waktu Unggah</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    {formatDateTimeId(existingProof.submittedAt)}
                  </span>
                </div>
                {existingProof.notes && (
                  <div className="sm:col-span-2">
                    <span className="text-slate-500 dark:text-slate-400 block">Catatan</span>
                    <span className="text-slate-800 dark:text-slate-200">{existingProof.notes}</span>
                  </div>
                )}
              </div>

              {isSafeImageDataUrl(existingProof.proofImageDataUrl) && (
                <div className="border border-slate-200/90 dark:border-slate-800 rounded-xl p-3 bg-[#F6F7FA] dark:bg-[#0B0F17]">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                    Lampiran Bukti Pembayaran ({existingProof.proofFileName})
                  </div>
                  <img
                    src={existingProof.proofImageDataUrl}
                    alt={`Bukti bayar ${loan.loanCode}`}
                    className="max-h-72 mx-auto rounded-lg border border-slate-200 dark:border-slate-700 object-contain bg-white"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                {!loan.finePaid && (
                  <button
                    type="button"
                    onClick={() => setViewProofOnly(false)}
                    className="px-4 py-2 text-xs font-semibold text-[#1A2B5E] dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 rounded-lg cursor-pointer"
                  >
                    Perbarui Bukti Pembayaran
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleFormSubmit} className="space-y-5">
              {/* Step 1: Payment Method Tabs */}
              <div className="space-y-3">
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  1. Pilih Metode Pembayaran
                </span>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setMethod('bank_transfer')}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer flex items-center gap-3 ${
                      method === 'bank_transfer'
                        ? 'border-[#1A2B5E] bg-indigo-50/80 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-100 dark:border-indigo-500'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <Building2 className="w-5 h-5 shrink-0 text-[#1A2B5E] dark:text-indigo-400" />
                    <div>
                      <div className="text-sm font-semibold">Transfer Rekening</div>
                      <div className="text-[11px] opacity-75">BCA · Mandiri · BRI</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMethod('qris')}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer flex items-center gap-3 ${
                      method === 'qris'
                        ? 'border-[#1A2B5E] bg-indigo-50/80 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-100 dark:border-indigo-500'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <QrCode className="w-5 h-5 shrink-0 text-[#1A2B5E] dark:text-indigo-400" />
                    <div>
                      <div className="text-sm font-semibold">QRIS Instan</div>
                      <div className="text-[11px] opacity-75">Scan via E-Wallet / M-Banking</div>
                    </div>
                  </button>
                </div>

                {/* Bank Transfer Details */}
                {method === 'bank_transfer' && (
                  <div className="space-y-2.5 pt-1">
                    {BANK_ACCOUNTS.map((acc) => {
                      const active = selectedBankId === acc.id;
                      return (
                        <div
                          key={acc.id}
                          onClick={() => setSelectedBankId(acc.id)}
                          className={`p-3.5 rounded-xl border transition-colors cursor-pointer flex flex-wrap items-center justify-between gap-3 ${
                            active
                              ? 'border-[#1A2B5E] bg-indigo-50/40 dark:bg-indigo-950/30 dark:border-indigo-500'
                              : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <div>
                            <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                              {acc.bank} · a.n. {acc.holder}
                            </div>
                            <div className="text-base font-mono tabular-nums font-bold text-[#1A2B5E] dark:text-indigo-300 mt-0.5">
                              {acc.accountNumber}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBankId(acc.id);
                              handleCopy(acc.id, acc.rawNumber);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 rounded-lg cursor-pointer"
                          >
                            {copiedKey === acc.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Tersalin</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-slate-400" />
                                <span>Salin Rekening</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* QRIS Payment Card */}
                {method === 'qris' && (
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white text-slate-900 space-y-4">
                    <div className="flex flex-col sm:flex-row items-center gap-5">
                      <div className="rounded-xl border border-slate-200 bg-white p-3 shrink-0 text-center shadow-2xs">
                        <div className="text-[10px] font-bold tracking-wider text-slate-900 uppercase">
                          {QRIS_MERCHANT_NAME}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 mb-2">
                          NMID: {QRIS_NMID} · {QRIS_TERMINAL_LABEL}
                        </div>
                        {showOriginalPoster ? (
                          <img
                            src={QRIS_POSTER_ASSET_URL}
                            alt="Kartu QRIS resmi Kazyfi, Digital & Kreatif"
                            className="w-44 h-56 object-contain mx-auto rounded"
                          />
                        ) : qrisDataUrl ? (
                          <img
                            src={qrisDataUrl}
                            alt={`QRIS Dinamis ${loan.loanCode} nominal ${formatRupiah(loan.fineAmount)}`}
                            className="w-44 h-44 object-contain mx-auto"
                          />
                        ) : (
                          <div className="w-44 h-44 flex items-center justify-center bg-slate-100 rounded text-xs text-slate-500">
                            Membuat QRIS...
                          </div>
                        )}
                        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-mono text-slate-500">
                          <span>Dicetak: {QRIS_PRINTED_BY}</span>
                          <span className="font-bold text-red-600">
                            {formatRupiah(loan.fineAmount)}
                          </span>
                        </div>
                      </div>

                      <div className="flex-1 min-w-0 space-y-2.5 text-center sm:text-left">
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                          <span className="inline-block px-2 py-0.5 text-[10px] font-mono font-bold tracking-wider uppercase rounded bg-[#1A2B5E] text-white">
                            QRIS STANDAR NASIONAL
                          </span>
                          <span className="inline-block px-2 py-0.5 text-[10px] font-semibold rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                            Nominal Otomatis Terisi
                          </span>
                        </div>
                        <div className="text-sm font-bold text-slate-950">
                          {QRIS_MERCHANT_NAME}
                        </div>
                        <div className="text-xs font-mono text-slate-500">
                          NMID: {QRIS_NMID} · Terminal {QRIS_TERMINAL_LABEL}
                        </div>
                        <div className="text-xs text-slate-600 leading-relaxed">
                          Pindai kode QR di samping menggunakan GoPay, OVO, DANA, ShopeePay, atau mobile banking. Nominal{' '}
                          <span className="font-mono font-bold text-slate-950">
                            {formatRupiah(loan.fineAmount)}
                          </span>{' '}
                          sudah tertanam otomatis di dalam QRIS dinamis ini, lalu unggah bukti bayar di bawah.
                        </div>
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                          {qrisDataUrl && (
                            <button
                              type="button"
                              onClick={handleDownloadQris}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1A2B5E] bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-lg cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Unduh QRIS ({formatRupiah(loan.fineAmount)})</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowOriginalPoster((prev) => !prev)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 hover:bg-slate-200/70 rounded-lg cursor-pointer"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            <span>{showOriginalPoster ? 'Tampilkan QRIS Dinamis' : 'Lihat Kartu QRIS Asli'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Step 2: Upload Payment Proof */}
              <div className="space-y-3 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  2. Tambahkan Bukti Sudah Bayar Denda
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Nama Pengirim / Pemilik Akun
                    </label>
                    <input
                      required
                      type="text"
                      value={payerName}
                      onChange={(e) => setPayerName(e.target.value)}
                      placeholder="Nama sesuai rekening / e-wallet"
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#1A2B5E] dark:focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      No. Referensi / ID Transaksi
                    </label>
                    <input
                      required
                      minLength={3}
                      type="text"
                      value={referenceCode}
                      onChange={(e) => setReferenceCode(e.target.value)}
                      placeholder={method === 'qris' ? 'Contoh: QRIS-8841209' : 'Contoh: TRF-26110042'}
                      className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#1A2B5E] dark:focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Unggah Foto / Screenshot Bukti Pembayaran (PNG, JPG, WEBP)
                  </label>
                  {proofImageDataUrl && isSafeImageDataUrl(proofImageDataUrl) ? (
                    <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F6F7FA] dark:bg-[#0B0F17] flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={proofImageDataUrl}
                          alt="Pratinjau bukti pembayaran"
                          className="w-16 h-16 rounded-lg object-cover border border-slate-200 dark:border-slate-700 bg-white shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {proofFileName || 'bukti-pembayaran.jpg'}
                          </div>
                          <div className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                            Siap dikirim untuk verifikasi Admin
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setProofImageDataUrl('');
                          setProofFileName('');
                        }}
                        className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg cursor-pointer shrink-0"
                        aria-label="Hapus gambar bukti"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-[#F6F7FA]/70 dark:bg-[#0B0F17] hover:border-[#1A2B5E] dark:hover:border-indigo-500 transition-colors cursor-pointer text-center">
                      <ImagePlus className="w-6 h-6 text-[#1A2B5E] dark:text-indigo-400" />
                      <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
                        Klik untuk pilih gambar bukti transfer atau struk QRIS
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Gambar dikompresi otomatis agar cepat terkirim
                      </div>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleFileSelect}
                        className="sr-only"
                      />
                    </label>
                  )}
                  {fileError && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1.5">{fileError}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Catatan Tambahan (Opsional)
                  </label>
                  <input
                    type="text"
                    maxLength={200}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Misal: Dibayar melalui m-Banking BCA pukul 14:20"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#1A2B5E] dark:focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#1A2B5E] hover:bg-[#132047] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  <Receipt className="w-4 h-4" />
                  <span>{submitting ? 'Mengirim Bukti...' : 'Kirim Bukti Pembayaran'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
