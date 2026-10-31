import React from 'react';

export type ThemeMode = 'dark' | 'light';

export interface ThemeConfig {
  readonly mode: ThemeMode;
  readonly wallpaperType: 'none' | 'custom-image' | 'custom-video';
  readonly customWallpaperUrl?: string;
  readonly customWallpaperName?: string;
  readonly overlayOpacity: number; // 0 to 90
  readonly blurAmount: number; // 0 to 20 px
  readonly customTextColor?: string; // Tùy chỉnh màu toàn bộ chữ
}

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  mode: 'dark',
  wallpaperType: 'none',
  overlayOpacity: 50,
  blurAmount: 0,
  customTextColor: undefined,
};

interface WallpaperBackgroundProps {
  readonly config: ThemeConfig;
  readonly isDark: boolean;
}

export const WallpaperBackground: React.FC<WallpaperBackgroundProps> = ({
  config,
  isDark,
}) => {
  if (config.wallpaperType === 'none') {
    return null;
  }

  const blurStyle = {
    filter: config.blurAmount > 0 ? `blur(${config.blurAmount}px)` : undefined,
    transform: config.blurAmount > 0 ? 'scale(1.04)' : undefined,
  };

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none"
    >
      {/* 1. Hình nền ảnh tĩnh / GIF tùy chọn */}
      {config.wallpaperType === 'custom-image' && config.customWallpaperUrl && (
        <div
          className="w-full h-full bg-cover bg-center transition-all duration-300"
          style={{
            backgroundImage: `url(${config.customWallpaperUrl})`,
            ...blurStyle,
          }}
        />
      )}

      {/* 2. Hình nền video (MP4 / WebM) tùy chọn */}
      {config.wallpaperType === 'custom-video' && config.customWallpaperUrl && (
        <video
          autoPlay
          loop
          muted
          playsInline
          src={config.customWallpaperUrl}
          className="w-full h-full object-cover transition-all duration-300"
          style={blurStyle}
        />
      )}

      {/* 3. Lớp phủ tương phản động: Đen trong Dark Mode, Trắng trong Light Mode */}
      <div
        className={`absolute inset-0 z-0 pointer-events-none transition-colors duration-200 ${
          isDark ? 'bg-black' : 'bg-white'
        }`}
        style={{
          opacity: config.overlayOpacity / 100,
        }}
      />
    </div>
  );
};
