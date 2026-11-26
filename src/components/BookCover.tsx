import { BookOpen } from 'lucide-react';
import { useState } from 'react';

interface BookCoverProps {
  src: string;
  title: string;
  className?: string;
}

export function BookCover({ src, title, className = '' }: BookCoverProps) {
  const [hasError, setHasError] = useState(false);

  if (hasError || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-slate-100 border border-slate-200 text-slate-500 p-3 text-center select-none ${className}`}
      >
        <BookOpen className="w-6 h-6 mb-2 text-slate-400" />
        <span className="text-xs font-medium leading-tight line-clamp-3 text-slate-600">
          {title}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`Sampul buku ${title}`}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={`object-cover bg-slate-100 ${className}`}
    />
  );
}
