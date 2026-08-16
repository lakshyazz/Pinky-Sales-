import React, { useState } from 'react';
import { Smartphone, BatteryCharging, Camera, Volume2, Zap, Layers, Package, ZoomIn, X } from 'lucide-react';

export const getCategoryIconInfo = (category = '') => {
  const cat = String(category || '').toLowerCase().trim();
  
  if (cat.includes('display') || cat.includes('screen') || cat.includes('combo') || cat.includes('touch') || cat.includes('folder') || cat.includes('oled') || cat.includes('incell') || cat.includes('lcd')) {
    return {
      Icon: Smartphone,
      emoji: '📱',
      label: 'Display',
      gradient: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)',
      color: '#0d9488',
      border: '#99f6e4',
    };
  }
  if (cat.includes('battery') || cat.includes('cell') || cat.includes('power')) {
    return {
      Icon: BatteryCharging,
      emoji: '🔋',
      label: 'Battery',
      gradient: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
      color: '#16a34a',
      border: '#bbf7d0',
    };
  }
  if (cat.includes('camera') || cat.includes('lens') || cat.includes('cam')) {
    return {
      Icon: Camera,
      emoji: '📷',
      label: 'Camera',
      gradient: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)',
      color: '#4f46e5',
      border: '#c7d2fe',
    };
  }
  if (cat.includes('speaker') || cat.includes('ringer') || cat.includes('mic') || cat.includes('audio') || cat.includes('buzzer') || cat.includes('earpiece')) {
    return {
      Icon: Volume2,
      emoji: '🔊',
      label: 'Speaker',
      gradient: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
      color: '#7c3aed',
      border: '#ddd6fe',
    };
  }
  if (cat.includes('charging') || cat.includes('charge') || cat.includes('port') || cat.includes('flex') || cat.includes('cable') || cat.includes('cc board') || cat.includes('connector')) {
    return {
      Icon: Zap,
      emoji: '🔌',
      label: 'Charging Port',
      gradient: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
      color: '#ea580c',
      border: '#fed7aa',
    };
  }
  if (cat.includes('housing') || cat.includes('glass') || cat.includes('back glass') || cat.includes('body') || cat.includes('frame') || cat.includes('panel')) {
    return {
      Icon: Layers,
      emoji: '🔲',
      label: 'Housing',
      gradient: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
      color: '#0284c7',
      border: '#bae6fd',
    };
  }
  
  return {
    Icon: Package,
    emoji: '📦',
    label: 'Accessory',
    gradient: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
    color: '#475569',
    border: '#e2e8f0',
  };
};

export default function ProductThumbnail({
  src,
  imageUrl,
  image_url,
  imageUrls,
  images,
  alt = 'Product Image',
  category = '',
  size = 40,
  className = '',
  showZoom = true,
  rounded = '12px',
}) {
  const [imageError, setImageError] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  // Resolve image source across various prop names and array formats
  const resolvedSrc = React.useMemo(() => {
    const raw = src || imageUrl || image_url;
    if (raw && typeof raw === 'string' && raw.trim().length > 0) return raw.trim();
    const list = imageUrls || images;
    if (Array.isArray(list) && list.length > 0) {
      const first = list[0];
      return typeof first === 'string' ? first : first?.url || '';
    }
    if (typeof list === 'string' && list.startsWith('[')) {
      try {
        const parsed = JSON.parse(list);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const first = parsed[0];
          return typeof first === 'string' ? first : first?.url || '';
        }
      } catch {}
    }
    return '';
  }, [src, imageUrl, image_url, imageUrls, images]);

  const [currentSrc, setCurrentSrc] = useState(resolvedSrc);
  const [triedProxy, setTriedProxy] = useState(false);

  // Reset states whenever resolved source changes
  React.useEffect(() => {
    setCurrentSrc(resolvedSrc);
    setImageError(false);
    setTriedProxy(false);
  }, [resolvedSrc]);

  const iconInfo = getCategoryIconInfo(category);
  const IconComponent = iconInfo.Icon;

  const dimensionStyle = typeof size === 'number' 
    ? { width: `${size}px`, height: `${size}px`, minWidth: `${size}px`, minHeight: `${size}px` } 
    : {};

  const iconSize = typeof size === 'number' ? Math.max(14, Math.round(size * 0.45)) : 18;

  const hasValidImage = Boolean(currentSrc && !imageError && currentSrc.length > 0);

  return (
    <>
      <div
        className={`relative inline-flex items-center justify-center overflow-hidden flex-shrink-0 transition-all duration-200 select-none ${className} ${hasValidImage && showZoom ? 'cursor-pointer hover:shadow-md hover:scale-[1.03]' : ''}`}
        style={{
          ...dimensionStyle,
          borderRadius: rounded,
          border: `1px solid ${hasValidImage ? '#e2e8f0' : iconInfo.border}`,
          background: hasValidImage ? '#ffffff' : iconInfo.gradient,
          boxShadow: hasValidImage ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
        }}
        onClick={(e) => {
          if (hasValidImage && showZoom) {
            e.stopPropagation();
            setIsZoomed(true);
          }
        }}
        title={hasValidImage && showZoom ? 'Click to enlarge image' : `${iconInfo.label} (${iconInfo.emoji})`}
      >
        {hasValidImage ? (
          <>
            <img
              src={currentSrc}
              alt={alt}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => {
                if (!triedProxy && currentSrc && !currentSrc.startsWith('data:')) {
                  setTriedProxy(true);
                  let key = currentSrc;
                  if (key.includes('/public/')) {
                    const parts = key.split('/public/')[1].split('/');
                    parts.shift();
                    key = parts.join('/');
                  } else if (key.includes('/products/')) {
                    key = 'products/' + key.split('/products/')[1];
                  } else if (key.startsWith('http')) {
                    try {
                      const u = new URL(key);
                      key = u.pathname.replace(/^\/+/, '');
                    } catch {}
                  }
                  if (key) {
                    const proxyUrl = `/api/images/${key.replace(/^\/+/, '')}`;
                    if (proxyUrl !== currentSrc) {
                      setCurrentSrc(proxyUrl);
                      return;
                    }
                  }
                }
                setImageError(true);
              }}
            />
            {showZoom && (
              <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                <ZoomIn size={Math.max(12, Math.round(iconSize * 0.8))} />
              </div>
            )}
          </>
        ) : (
          <div
            className="flex items-center justify-center w-full h-full"
            style={{ color: iconInfo.color }}
          >
            <IconComponent size={iconSize} strokeWidth={2.2} />
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      {isZoomed && hasValidImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn"
          onClick={(e) => {
            e.stopPropagation();
            setIsZoomed(false);
          }}
        >
          <div
            className="relative max-w-2xl max-h-[85vh] bg-white rounded-2xl p-2 shadow-2xl overflow-hidden flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsZoomed(false)}
              className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white flex items-center justify-center shadow-lg transition-all cursor-pointer"
              title="Close preview"
            >
              <X size={18} />
            </button>
            <img
              src={src}
              alt={alt}
              className="max-w-full max-h-[75vh] object-contain rounded-xl"
            />
            <div className="w-full text-center py-2 px-4 text-xs font-bold text-slate-700 truncate">
              {alt}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
