import React, { useRef, useState } from 'react';
import { Image as ImageIcon, Trash2, Upload } from 'lucide-react';
import { OptimizeImageOptions, readAndOptimizeImage } from '../../utils/imageUpload';

interface ImageUploadFieldProps {
  label?: string;
  value: string;
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
  emptyHint?: string;
  previewAspect?: 'square' | 'landscape';
  optimizeOptions?: OptimizeImageOptions;
  onError?: (msg: string) => void;
}

export const ImageUploadField: React.FC<ImageUploadFieldProps> = ({
  label,
  value,
  onChange,
  disabled = false,
  emptyHint = 'No image uploaded',
  previewAspect = 'square',
  optimizeOptions,
  onError,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await readAndOptimizeImage(file, optimizeOptions);
      onChange(dataUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to upload image';
      onError?.(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
          {label}
        </label>
      )}
      <div className="flex items-center gap-3 rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black p-2.5">
        <div
          className={`shrink-0 rounded-md border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] overflow-hidden flex items-center justify-center ${
            previewAspect === 'landscape' ? 'w-20 h-14' : 'w-12 h-12'
          }`}
        >
          {value ? (
            <img
              src={value}
              alt={label || 'Uploaded image preview'}
              referrerPolicy="no-referrer"
              className={`w-full h-full ${
                previewAspect === 'landscape' ? 'object-cover' : 'object-contain p-0.5'
              }`}
            />
          ) : (
            <ImageIcon className="h-5 w-5 text-neutral-400 dark:text-zinc-600" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate">
            {value ? 'Uploaded image ready' : emptyHint}
          </div>
          <div className="text-[11px] text-neutral-500 dark:text-neutral-500 mt-0.5">
            PNG, JPG, WebP, or SVG
          </div>
        </div>

        {!disabled && (
          <div className="flex items-center gap-1.5 shrink-0">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] hover:bg-neutral-100 dark:hover:bg-zinc-900 text-xs font-medium text-neutral-700 dark:text-neutral-200 whitespace-nowrap disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
              <span>{busy ? 'Loading...' : value ? 'Replace' : 'Upload'}</span>
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange('')}
                title="Remove image"
                aria-label="Remove image"
                className="p-1.5 rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
