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
        className={`flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 p-3 text-center select-none ${className}`}
      >
        <BookOpen className="w-6 h-6 mb-2 text-slate-400 dark:text-slate-500" />
        <span className="text-xs font-medium leading-tight line-clamp-3 text-slate-600 dark:text-slate-300">
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
      className={`object-cover bg-slate-100 dark:bg-slate-800 ${className}`}
    />
  );
}
