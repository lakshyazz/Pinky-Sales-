import React, { useState, useRef } from 'react';
import { UploadCloud, Image as ImageIcon, Trash2, RefreshCw, Loader2, CheckCircle2, AlertCircle, Plus, Eye, Sparkles } from 'lucide-react';
import ProductThumbnail from './ProductThumbnail';

export default function ProductImageUpload({
  imageUrl = '',
  imageUrls = [],
  onImageChange,
  category = 'Display',
  disabled = false,
  showMultiple = true,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [previewZoomUrl, setPreviewZoomUrl] = useState(null);
  const fileInputRef = useRef(null);

  // Normalize imageUrls into a clean array of strings
  const parsedImageUrls = React.useMemo(() => {
    if (!imageUrls) return [];
    if (Array.isArray(imageUrls)) {
      return imageUrls.map(item => typeof item === 'string' ? item : item?.url).filter(Boolean);
    }
    if (typeof imageUrls === 'string') {
      try {
        const parsed = JSON.parse(imageUrls);
        if (Array.isArray(parsed)) {
          return parsed.map(item => typeof item === 'string' ? item : item?.url).filter(Boolean);
        }
      } catch {
        return imageUrls ? [imageUrls] : [];
      }
    }
    return [];
  }, [imageUrls]);

  // Combine primary and gallery into full list
  const allImages = React.useMemo(() => {
    const list = [...parsedImageUrls];
    if (imageUrl && !list.includes(imageUrl)) {
      list.unshift(imageUrl);
    }
    return list;
  }, [imageUrl, parsedImageUrls]);

  const validateFile = (file) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      throw new Error(`"${file.name}" is not supported. Allowed formats: JPG, PNG, WEBP.`);
    }
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new Error(`"${file.name}" exceeds the 10 MB limit (${Math.round(file.size / (1024 * 1024))} MB).`);
    }
  };

  const getAuthToken = () => {
    let token = localStorage.getItem('as_store_token') || localStorage.getItem('token');
    if (!token) {
      try {
        const sessionRaw = localStorage.getItem('session');
        if (sessionRaw) {
          const parsed = JSON.parse(sessionRaw);
          token = parsed?.token || '';
        }
      } catch {}
    }
    return token || '';
  };

  const getApiEndpoint = (endpoint) => {
    const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const configuredApiBase = import.meta.env.VITE_API_BASE_URL;
    const apiBase = (configuredApiBase || (isLocalhost ? 'http://localhost:5000/api' : '/api')).replace(/\/$/, '');
    return `${apiBase}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  };

  const uploadFiles = async (files) => {
    if (!files || files.length === 0 || disabled) return;
    setErrorMessage('');
    setUploading(true);

    try {
      const fileList = Array.from(files);
      fileList.forEach(validateFile);

      const token = getAuthToken();
      const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

      if (fileList.length === 1) {
        const formData = new FormData();
        formData.append('image', fileList[0]);

        const uploadUrl = getApiEndpoint('/upload/image');
        const res = await fetch(uploadUrl, {
          method: 'POST',
          headers: authHeaders,
          body: formData,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.url) {
          throw new Error(data.error || `Upload failed with status ${res.status}`);
        }

        const newUrl = data.url;
        const updatedList = allImages.includes(newUrl) ? allImages : [...allImages, newUrl];
        const primary = imageUrl || newUrl;

        onImageChange?.({
          imageUrl: primary,
          imageUrls: updatedList,
        });
      } else {
        const formData = new FormData();
        fileList.forEach((file) => formData.append('images', file));

        const batchUploadUrl = getApiEndpoint('/upload/images');
        const res = await fetch(batchUploadUrl, {
          method: 'POST',
          headers: authHeaders,
          body: formData,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.images) {
          throw new Error(data.error || `Batch upload failed with status ${res.status}`);
        }

        const newUrls = data.images.map(img => img.url);
        const combined = Array.from(new Set([...allImages, ...newUrls]));
        const primary = imageUrl || combined[0] || '';

        onImageChange?.({
          imageUrl: primary,
          imageUrls: combined,
        });
      }
    } catch (err) {
      console.error('[Upload Error]', err);
      setErrorMessage(err.message || 'Image upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (!disabled && e.dataTransfer.files) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files) {
      uploadFiles(e.target.files);
    }
  };

  const handleRemoveImage = (targetUrl) => {
    const updated = allImages.filter(url => url !== targetUrl);
    const newPrimary = imageUrl === targetUrl ? (updated[0] || '') : imageUrl;
    onImageChange?.({
      imageUrl: newPrimary,
      imageUrls: updated,
    });
  };

  const handleSetPrimary = (targetUrl) => {
    const remaining = allImages.filter(url => url !== targetUrl);
    const updated = [targetUrl, ...remaining];
    onImageChange?.({
      imageUrl: targetUrl,
      imageUrls: updated,
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <ImageIcon size={14} className="text-teal-600" />
          <span>Product Image Storage (Cloudflare R2)</span>
        </label>
        <span className="text-[10px] font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200/60 flex items-center gap-1">
          <Sparkles size={11} /> Free 10 GB Tier · WebP 800×800
        </span>
      </div>

      {/* Upload Drag & Drop Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && !uploading && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-4 text-center transition-all duration-200 cursor-pointer ${
          isDragging
            ? 'border-teal-500 bg-teal-50/70 scale-[1.01]'
            : 'border-slate-300 hover:border-teal-500 hover:bg-slate-50/70 bg-white'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/jpg"
          multiple={showMultiple}
          className="hidden"
          onChange={handleFileSelect}
          disabled={disabled || uploading}
        />

        <div className="flex flex-col items-center justify-center gap-2">
          {uploading ? (
            <div className="flex flex-col items-center justify-center py-2 gap-2 text-teal-600">
              <Loader2 size={28} className="animate-spin" />
              <span className="text-xs font-bold">Optimizing WebP & Uploading to R2...</span>
            </div>
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center shadow-xs">
                <UploadCloud size={20} />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700">
                  <span className="text-teal-600 hover:underline">Click to browse</span> or drag & drop product images
                </p>
                <p className="text-[10.5px] text-slate-400 font-medium mt-0.5">
                  JPG, PNG, or WEBP up to 10 MB (automatically converted to 800×800 WebP)
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="flex items-center gap-1.5 p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
          <AlertCircle size={14} className="flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Image Gallery / Thumbnails */}
      {allImages.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
            <span>Uploaded Images ({allImages.length}):</span>
            <span className="text-[10px] text-slate-400">Click thumbnail to set as primary</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {allImages.map((url, index) => {
              const isPrimary = (imageUrl ? url === imageUrl : index === 0);
              return (
                <div
                  key={url || index}
                  className={`group relative rounded-xl border p-1.5 bg-white transition-all shadow-xs flex flex-col items-center ${
                    isPrimary ? 'border-teal-500 ring-2 ring-teal-500/20 shadow-sm' : 'border-slate-200 hover:border-slate-400'
                  }`}
                >
                  <div className="relative w-full h-24 rounded-lg overflow-hidden bg-slate-50 flex items-center justify-center">
                    <img
                      src={url}
                      alt={`Product image ${index + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />

                    {/* Primary Badge */}
                    {isPrimary && (
                      <span className="absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded-md bg-teal-600 text-white text-[9px] font-black tracking-wider uppercase shadow-xs flex items-center gap-0.5">
                        <CheckCircle2 size={10} /> Cover
                      </span>
                    )}

                    {/* Hover Overlay Actions */}
                    <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                      {!isPrimary && (
                        <button
                          type="button"
                          onClick={() => handleSetPrimary(url)}
                          title="Set as main cover image"
                          className="px-2 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white text-[10px] font-bold transition-all shadow-sm cursor-pointer"
                        >
                          Make Cover
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(url)}
                        title="Remove image"
                        className="p-1 rounded bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-sm cursor-pointer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  <div className="w-full flex items-center justify-between mt-1 px-1 text-[10px] text-slate-500">
                    <span className="truncate max-w-[90px]">{url.split('/').pop()?.slice(0, 14)}...</span>
                    {isPrimary ? (
                      <span className="font-extrabold text-teal-600">Main</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSetPrimary(url)}
                        className="text-slate-400 hover:text-teal-600 font-semibold cursor-pointer"
                      >
                        Set Main
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fallback Preview when no images uploaded */}
      {allImages.length === 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
          <ProductThumbnail size={48} category={category} showZoom={false} />
          <div className="text-xs text-slate-500">
            <span className="font-bold text-slate-700 block">Default Category Fallback Icon</span>
            <span>When no image is uploaded, the {category || 'product'} icon will display across catalogs.</span>
          </div>
        </div>
      )}
    </div>
  );
}
