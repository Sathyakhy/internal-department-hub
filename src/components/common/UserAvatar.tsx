import React, { useState } from 'react';

interface UserAvatarProps {
  name: string;
  avatarUrl?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<UserAvatarProps['size']>, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
};

const PALETTE = [
  'bg-sky-600 text-white',
  'bg-zinc-800 text-white',
  'bg-amber-600 text-white',
  'bg-red-600 text-white',
  'bg-neutral-700 text-white',
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getColorClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export const UserAvatar: React.FC<UserAvatarProps> = ({ name, avatarUrl, size = 'md', className = '' }) => {
  const [imgError, setImgError] = useState(false);
  const sizeCls = SIZE_CLASSES[size];

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className={`${sizeCls} shrink-0 rounded-full object-cover border border-neutral-200 dark:border-zinc-800 ${className}`}
      />
    );
  }

  return (
    <div
      aria-label={name}
      className={`${sizeCls} ${getColorClass(
        name
      )} shrink-0 rounded-full font-display font-semibold flex items-center justify-center select-none ${className}`}
    >
      {getInitials(name)}
    </div>
  );
};
