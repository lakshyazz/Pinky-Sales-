import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Palette, X, Check, Plus } from 'lucide-react';

const getColorDot = (colourName) => {
  if (!colourName) return 'bg-zinc-400';
  const c = colourName.toLowerCase().trim();
  if (c.includes('black')) return 'bg-zinc-900 border border-zinc-700';
  if (c.includes('white')) return 'bg-white border border-zinc-300';
  if (c.includes('blue') || c.includes('cyan') || c.includes('sky')) return 'bg-sky-500';
  if (c.includes('gold') || c.includes('yellow')) return 'bg-amber-400';
  if (c.includes('green') || c.includes('mint') || c.includes('forest')) return 'bg-emerald-500';
  if (c.includes('red') || c.includes('crimson')) return 'bg-rose-500';
  if (c.includes('purple') || c.includes('violet')) return 'bg-violet-500';
  if (c.includes('pink') || c.includes('rose')) return 'bg-pink-400';
  if (c.includes('silver') || c.includes('grey') || c.includes('gray')) return 'bg-slate-400';
  if (c.includes('orange') || c.includes('bronze')) return 'bg-orange-500';
  return 'bg-violet-400';
};

export default function ColorBreakdownPopover({
  isOpen,
  onClose,
  product,
  currentPrice = '',
  onApplyLines,
}) {
  const [quantities, setQuantities] = useState({});

  if (!isOpen || !product) return null;

  // Parse product colors
  let colorsList = [];
  const rawColours = product.colours || product.available_colours;
  if (Array.isArray(rawColours)) {
    colorsList = rawColours.map(c => String(c).trim()).filter(Boolean);
  } else if (typeof rawColours === 'string' && rawColours.trim()) {
    try {
      const parsed = JSON.parse(rawColours);
      if (Array.isArray(parsed)) colorsList = parsed.map(c => String(c).trim()).filter(Boolean);
      else colorsList = rawColours.split(',').map(c => c.trim()).filter(Boolean);
    } catch {
      colorsList = rawColours.split(',').map(c => c.trim()).filter(Boolean);
    }
  }

  if (colorsList.length === 0) {
    colorsList = ['Standard'];
  }

  const handleQtyChange = (color, val) => {
    const num = parseInt(val, 10);
    setQuantities(prev => ({
      ...prev,
      [color]: isNaN(num) || num < 0 ? '' : num,
    }));
  };

  const handleQuickAdd = (color, addAmount) => {
    setQuantities(prev => {
      const current = Number(prev[color] || 0);
      return { ...prev, [color]: current + addAmount };
    });
  };

  const totalPcs = Object.values(quantities).reduce((sum, q) => sum + Number(q || 0), 0);

  const handleApply = () => {
    const generatedLines = [];
    for (const color of colorsList) {
      const qty = Number(quantities[color] || 0);
      if (qty > 0) {
        generatedLines.push({
          product_id: product.id,
          custom_product_name: `${product.short_name || product.name} - ${color}`,
          colour: color,
          quantity: qty,
          unit_price: currentPrice || product.purchase_price || '',
          discount_amount: 0,
        });
      }
    }

    if (generatedLines.length > 0) {
      onApplyLines(generatedLines);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.14 }}
          className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden text-xs"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50/70 dark:bg-zinc-900/60">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-pink-100 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300">
                <Palette size={15} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-zinc-900 dark:text-white">Color Variant Breakdown</h4>
                <p className="text-[10.5px] text-zinc-500 dark:text-zinc-400 font-normal truncate max-w-[200px]">
                  {product.short_name || product.name}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>

          {/* Color rows */}
          <div className="p-4 max-h-72 overflow-y-auto space-y-2">
            {colorsList.map((color) => {
              const currentQty = quantities[color] || '';
              const dotClass = getColorDot(color);

              return (
                <div
                  key={color}
                  className="flex items-center justify-between gap-2 p-2 rounded-xl bg-zinc-50/80 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800/80"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotClass}`} />
                    <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">{color}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleQuickAdd(color, 10)}
                        className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 cursor-pointer transition-colors"
                      >
                        +10
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickAdd(color, 25)}
                        className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 cursor-pointer transition-colors"
                      >
                        +25
                      </button>
                    </div>

                    <input
                      type="number"
                      min={0}
                      value={currentQty}
                      onChange={(e) => handleQtyChange(color, e.target.value)}
                      placeholder="0"
                      className="w-16 px-2 py-1 text-xs font-mono font-semibold text-right border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:border-pink-500 outline-hidden"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/60 flex items-center justify-between">
            <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Total: <span className="font-bold font-mono text-zinc-900 dark:text-zinc-100">{totalPcs} pcs</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={totalPcs === 0}
                onClick={handleApply}
                className="px-3.5 py-1.5 text-xs font-medium text-white bg-pink-600 hover:bg-pink-700 dark:bg-pink-600 dark:hover:bg-pink-500 rounded-lg transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Check size={13} />
                <span>Apply Lines ({totalPcs} pcs)</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

