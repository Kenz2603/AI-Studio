import React, { useEffect, useRef, useState } from 'react';
import {
  Sun,
  Moon,
  Upload,
  X,
  Sliders,
  Trash2,
  Check,
  Film,
  Image as ImageIcon,
  Palette,
  Type,
} from 'lucide-react';
import type { ThemeConfig } from './WallpaperBackground';

interface ThemeControlModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly config: ThemeConfig;
  readonly onChangeConfig: (newConfig: ThemeConfig) => void;
  readonly isDark: boolean;
}

export const ThemeControlModal: React.FC<ThemeControlModalProps> = ({
  isOpen,
  onClose,
  config,
  onChangeConfig,
  isDark,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // 1. Chọn Trắng (Nền trắng, chữ đen, không hình nền)
  const handleSelectWhite = () => {
    onChangeConfig({
      ...config,
      mode: 'light',
      wallpaperType: 'none',
      customWallpaperUrl: undefined,
      customWallpaperName: undefined,
    });
  };

  // 2. Chọn Đen (Nền đen, chữ trắng, không hình nền)
  const handleSelectBlack = () => {
    onChangeConfig({
      ...config,
      mode: 'dark',
      wallpaperType: 'none',
      customWallpaperUrl: undefined,
      customWallpaperName: undefined,
    });
  };

  // 3. Tải tệp hình nền Tự chọn (Ảnh hoặc Video)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    if (!isImage && !isVideo) {
      setUploadError('Chỉ hỗ trợ tệp ảnh (PNG, JPG, WebP, GIF) hoặc video (MP4, WebM).');
      return;
    }

    const maxSizeBytes = isVideo ? 35 * 1024 * 1024 : 15 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setUploadError(
        `Dung lượng tệp vượt quá giới hạn (${isVideo ? '35MB' : '15MB'}). Vui lòng chọn tệp nhỏ hơn.`
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      onChangeConfig({
        ...config,
        wallpaperType: isVideo ? 'custom-video' : 'custom-image',
        customWallpaperUrl: result,
        customWallpaperName: file.name,
      });
    };
    reader.onerror = () => {
      setUploadError('Không thể đọc tệp đã chọn. Vui lòng thử lại.');
    };
    reader.readAsDataURL(file);
  };

  const handleClearCustomWallpaper = () => {
    onChangeConfig({
      ...config,
      wallpaperType: 'none',
      customWallpaperUrl: undefined,
      customWallpaperName: undefined,
    });
  };

  const isWhiteActive = config.mode === 'light' && config.wallpaperType === 'none';
  const isBlackActive = config.mode === 'dark' && config.wallpaperType === 'none';
  const isCustomActive = config.wallpaperType !== 'none';

  return (
    <div
      data-testid="theme-control-modal-backdrop"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div
        data-testid="theme-control-modal"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-lg rounded-2xl border p-6 shadow-2xl transition-all ${
          isDark
            ? 'bg-zinc-950 border-zinc-800 text-white'
            : 'bg-white border-zinc-300 text-black'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between pb-4 border-b ${
            isDark ? 'border-zinc-800' : 'border-zinc-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl border ${
                isDark
                  ? 'bg-zinc-900 border-zinc-800 text-white'
                  : 'bg-zinc-100 border-zinc-300 text-black'
              }`}
            >
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Tùy chỉnh Giao diện</h2>
              <p
                className={`text-xs ${
                  isDark ? 'text-zinc-400' : 'text-zinc-600'
                }`}
              >
                Chỉ có 3 tùy chọn: Trắng, Đen, hoặc Tự chọn hình nền
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="btn-close-theme-modal"
            onClick={onClose}
            className={`p-1.5 rounded-xl border transition-colors ${
              isDark
                ? 'border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-white'
                : 'border-zinc-200 hover:bg-zinc-100 text-zinc-600 hover:text-black'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3 Tùy chọn chính: Trắng, Đen, Tự chọn */}
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* 1. Tùy chọn TRẮNG */}
            <button
              type="button"
              data-testid="btn-theme-white"
              onClick={handleSelectWhite}
              className={`p-4 rounded-xl border flex flex-col items-center justify-between text-center gap-2.5 transition-all ${
                isWhiteActive
                  ? isDark
                    ? 'border-white bg-white/10 ring-2 ring-white/40 text-white font-bold'
                    : 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/30 text-indigo-700 font-bold'
                  : isDark
                  ? 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 text-zinc-300'
                  : 'border-zinc-200 bg-zinc-50 hover:border-zinc-400 text-zinc-800'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <Sun className="w-5 h-5 text-amber-500" />
                {isWhiteActive && <Check className="w-4 h-4" />}
              </div>
              <div className="text-left w-full">
                <div className="font-bold text-sm">Trắng</div>
                <div className="text-[11px] opacity-75 mt-0.5">
                  Nền trắng • Chữ đen
                </div>
              </div>
            </button>

            {/* 2. Tùy chọn ĐEN */}
            <button
              type="button"
              data-testid="btn-theme-black"
              onClick={handleSelectBlack}
              className={`p-4 rounded-xl border flex flex-col items-center justify-between text-center gap-2.5 transition-all ${
                isBlackActive
                  ? isDark
                    ? 'border-white bg-white/10 ring-2 ring-white/40 text-white font-bold'
                    : 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/30 text-indigo-700 font-bold'
                  : isDark
                  ? 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 text-zinc-300'
                  : 'border-zinc-200 bg-zinc-50 hover:border-zinc-400 text-zinc-800'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <Moon className="w-5 h-5 text-zinc-300" />
                {isBlackActive && <Check className="w-4 h-4" />}
              </div>
              <div className="text-left w-full">
                <div className="font-bold text-sm">Đen</div>
                <div className="text-[11px] opacity-75 mt-0.5">
                  Nền đen • Chữ trắng
                </div>
              </div>
            </button>

            {/* 3. Tùy chọn TỰ CHỌN */}
            <button
              type="button"
              data-testid="btn-theme-custom"
              onClick={() => {
                if (config.wallpaperType === 'none') {
                  fileInputRef.current?.click();
                }
              }}
              className={`p-4 rounded-xl border flex flex-col items-center justify-between text-center gap-2.5 transition-all ${
                isCustomActive
                  ? isDark
                    ? 'border-white bg-white/10 ring-2 ring-white/40 text-white font-bold'
                    : 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/30 text-indigo-700 font-bold'
                  : isDark
                  ? 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 text-zinc-300'
                  : 'border-zinc-200 bg-zinc-50 hover:border-zinc-400 text-zinc-800'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <Upload className="w-5 h-5" />
                {isCustomActive && <Check className="w-4 h-4" />}
              </div>
              <div className="text-left w-full">
                <div className="font-bold text-sm">Tự chọn</div>
                <div className="text-[11px] opacity-75 mt-0.5">
                  Hình nền / video riêng
                </div>
              </div>
            </button>
          </div>

          {/* Phần Tải lên hình nền Tự chọn từ máy */}
          <div
            className={`p-4 rounded-xl border space-y-3.5 ${
              isDark
                ? 'bg-zinc-900/60 border-zinc-800'
                : 'bg-zinc-50 border-zinc-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider">
                  Tải lên tệp ảnh hoặc video từ máy tính
                </h3>
                <p
                  className={`text-[11px] mt-0.5 ${
                    isDark ? 'text-zinc-400' : 'text-zinc-600'
                  }`}
                >
                  Hỗ trợ ảnh tĩnh (PNG, JPG, WebP), ảnh động (GIF) và video (MP4, WebM).
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
                onChange={handleFileChange}
                className="hidden"
              />

              <button
                type="button"
                data-testid="btn-upload-file"
                onClick={() => fileInputRef.current?.click()}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  isDark
                    ? 'bg-white text-black hover:bg-zinc-200 border-white'
                    : 'bg-indigo-600 text-white hover:bg-indigo-500 border-indigo-600'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Chọn tệp...</span>
              </button>
            </div>

            {config.customWallpaperName && (
              <div
                className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                  isDark
                    ? 'bg-zinc-950 border-zinc-800'
                    : 'bg-white border-zinc-300'
                }`}
              >
                <div className="flex items-center gap-2 truncate font-mono">
                  {config.wallpaperType === 'custom-video' ? (
                    <Film className="w-4 h-4 shrink-0" />
                  ) : (
                    <ImageIcon className="w-4 h-4 shrink-0" />
                  )}
                  <span className="truncate">{config.customWallpaperName}</span>
                </div>
                <button
                  type="button"
                  onClick={handleClearCustomWallpaper}
                  className="inline-flex items-center gap-1 text-[11px] text-rose-500 hover:underline shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa</span>
                </button>
              </div>
            )}

            {uploadError && (
              <p className="text-xs text-rose-500 font-medium">{uploadError}</p>
            )}

            {/* Tùy chỉnh chế độ chữ & độ phủ khi dùng hình nền tự chọn */}
            {isCustomActive && (
              <div
                className={`pt-3 border-t space-y-3 ${
                  isDark ? 'border-zinc-800' : 'border-zinc-200'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Màu chữ trên hình nền:</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onChangeConfig({ ...config, mode: 'dark' })}
                      className={`px-3 py-1 rounded-lg border text-xs font-medium transition-all ${
                        config.mode === 'dark'
                          ? isDark
                            ? 'bg-white text-black border-white font-bold'
                            : 'bg-indigo-600 text-white border-indigo-600 font-bold'
                          : isDark
                          ? 'bg-zinc-950 border-zinc-800 text-zinc-400'
                          : 'bg-white border-zinc-300 text-zinc-600'
                      }`}
                    >
                      Chữ Trắng
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeConfig({ ...config, mode: 'light' })}
                      className={`px-3 py-1 rounded-lg border text-xs font-medium transition-all ${
                        config.mode === 'light'
                          ? isDark
                            ? 'bg-white text-black border-white font-bold'
                            : 'bg-indigo-600 text-white border-indigo-600 font-bold'
                          : isDark
                          ? 'bg-zinc-950 border-zinc-800 text-zinc-400'
                          : 'bg-white border-zinc-300 text-zinc-600'
                      }`}
                    >
                      Chữ Đen
                    </button>
                  </div>
                </div>

                {/* Slider Độ phủ màu */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>
                      Độ phủ tương phản ({config.mode === 'dark' ? 'Lớp phủ đen' : 'Lớp phủ trắng'}):
                    </span>
                    <span className="font-mono font-bold">{config.overlayOpacity}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="90"
                    step="5"
                    value={config.overlayOpacity}
                    onChange={(e) =>
                      onChangeConfig({
                        ...config,
                        overlayOpacity: Number(e.target.value),
                      })
                    }
                    className="w-full cursor-pointer accent-current"
                  />
                </div>

                {/* Slider Độ nhòe */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>Độ nhòe hình nền (Blur):</span>
                    <span className="font-mono font-bold">{config.blurAmount}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="1"
                    value={config.blurAmount}
                    onChange={(e) =>
                      onChangeConfig({
                        ...config,
                        blurAmount: Number(e.target.value),
                      })
                    }
                    className="w-full cursor-pointer accent-current"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 4. Tùy chỉnh màu toàn bộ chữ hệ thống */}
          <div
            className={`p-4 rounded-xl border space-y-3.5 ${
              isDark
                ? 'bg-zinc-900/60 border-zinc-800'
                : 'bg-zinc-50 border-zinc-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5" />
                  <span>Chỉnh màu toàn bộ chữ (Global Text Color)</span>
                </h3>
                <p
                  className={`text-[11px] mt-0.5 ${
                    isDark ? 'text-zinc-400' : 'text-zinc-600'
                  }`}
                >
                  Áp dụng màu chữ đồng nhất cho toàn bộ giao diện, các trang và các bảng.
                </p>
              </div>

              {config.customTextColor && (
                <button
                  type="button"
                  data-testid="btn-reset-text-color"
                  onClick={() =>
                    onChangeConfig({
                      ...config,
                      customTextColor: undefined,
                    })
                  }
                  className="text-[11px] font-semibold text-rose-500 hover:underline shrink-0"
                >
                  Mặc định (Theo Sáng/Tối)
                </button>
              )}
            </div>

            {/* Bảng màu mẫu nhanh */}
            <div className="flex flex-wrap items-center gap-2">
              {[
                { label: 'Trắng', color: '#FFFFFF' },
                { label: 'Đen', color: '#000000' },
                { label: 'Xám bạc', color: '#CBD5E1' },
                { label: 'Vàng kim', color: '#FACC15' },
                { label: 'Lục ngọc', color: '#4ADE80' },
                { label: 'Xanh băng', color: '#38BDF8' },
                { label: 'Tím pastel', color: '#C084FC' },
                { label: 'Cam sáng', color: '#FB923C' },
                { label: 'Đỏ hồng', color: '#F43F5E' },
              ].map((swatch) => (
                <button
                  key={swatch.color}
                  type="button"
                  data-testid={`swatch-${swatch.color}`}
                  onClick={() =>
                    onChangeConfig({
                      ...config,
                      customTextColor: swatch.color,
                    })
                  }
                  title={`Chọn màu chữ: ${swatch.label} (${swatch.color})`}
                  className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center ${
                    config.customTextColor === swatch.color
                      ? 'ring-2 ring-indigo-500 scale-110 border-white'
                      : 'border-zinc-700'
                  }`}
                  style={{ backgroundColor: swatch.color }}
                >
                  {config.customTextColor === swatch.color && (
                    <Check
                      className="w-3.5 h-3.5"
                      style={{
                        color:
                          swatch.color === '#FFFFFF' ||
                          swatch.color === '#FACC15' ||
                          swatch.color === '#CBD5E1'
                            ? '#000000'
                            : '#FFFFFF',
                      }}
                    />
                  )}
                </button>
              ))}

              {/* Ô chọn màu tự do */}
              <label
                className="relative cursor-pointer flex items-center justify-center w-7 h-7 rounded-full border-2 border-dashed border-zinc-500 hover:border-white transition-all"
                title="Bấm để chọn màu bất kỳ trong bảng mã màu"
              >
                <input
                  type="color"
                  value={config.customTextColor || (isDark ? '#FFFFFF' : '#000000')}
                  onChange={(e) =>
                    onChangeConfig({
                      ...config,
                      customTextColor: e.target.value,
                    })
                  }
                  className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                />
                <Palette className="w-3.5 h-3.5 text-zinc-400" />
              </label>

              {config.customTextColor && (
                <span className="text-xs font-mono px-2 py-0.5 rounded border border-zinc-700 bg-zinc-900 text-zinc-200">
                  {config.customTextColor}
                </span>
              )}
            </div>

            {/* Mẫu chữ thử nghiệm */}
            <div
              className={`p-2.5 rounded-lg border text-xs font-medium ${
                isDark
                  ? 'bg-zinc-950/80 border-zinc-800'
                  : 'bg-white border-zinc-200'
              }`}
            >
              <span className="text-[11px] opacity-60 mr-2">Mẫu chữ hiển thị:</span>
              <span
                style={{
                  color:
                    config.customTextColor ||
                    (isDark ? '#FFFFFF' : '#000000'),
                }}
                className="font-bold text-sm"
              >
                Personal AI Studio — Studio AI Cá Nhân
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className={`mt-5 pt-4 border-t flex items-center justify-between ${
            isDark ? 'border-zinc-800' : 'border-zinc-200'
          }`}
        >
          <span
            className={`text-xs ${
              isDark ? 'text-zinc-400' : 'text-zinc-600'
            }`}
          >
            Đang áp dụng:{' '}
            <strong>
              {isWhiteActive
                ? 'Giao diện Trắng'
                : isBlackActive
                ? 'Giao diện Đen'
                : 'Tự chọn hình nền'}
            </strong>
          </span>

          <button
            type="button"
            data-testid="btn-confirm-theme"
            onClick={onClose}
            className={`px-5 py-2 rounded-xl text-xs font-bold border transition-colors ${
              isDark
                ? 'bg-white text-black hover:bg-zinc-200 border-white'
                : 'bg-indigo-600 text-white hover:bg-indigo-500 border-indigo-600'
            }`}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
