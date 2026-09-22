import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingBag,
  X,
  Plus,
  Trash2,
  Check,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Layers,
  Palette,
  Tag,
  Building2,
  Calendar,
  CreditCard,
  Percent,
  FileText,
  DollarSign,
  TrendingUp,
  Clock,
  ChevronRight,
  Info,
  CornerDownRight,
  ChevronDown,
} from 'lucide-react';
import SearchableCombobox from './SearchableCombobox';
import ProductTableCell from './ProductTableCell';
import ProductSearchDialog from './ProductSearchDialog';
import QuickAddVendorModal from './QuickAddVendorModal';
import QuickAddProductModal from './QuickAddProductModal';
import BatchProductPickerModal from './BatchProductPickerModal';
import ColorBreakdownPopover from './ColorBreakdownPopover';
import CurrencyInput from '../ui/CurrencyInput';

const money = (v) => Math.round(Number(v || 0) * 100) / 100;
const currency = (v) => `₹${money(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);

const getColorDot = (colourName) => {
  if (!colourName) return null;
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

export default function NewPurchaseBillModal({
  isOpen,
  billToEdit = null,
  onClose,
  onSaved,
  suppliers: initialSuppliers = [],
  products: initialProducts = [],
  shopId: initialShopId,
  shops = [],
  warehouse = null,
  session = null,
  role = '',
  api,
  setGlobalToast,
}) {
  const [suppliersList, setSuppliersList] = useState(initialSuppliers);
  const [productsList, setProductsList] = useState(initialProducts);

  // Destination Shop / Warehouse resolution
  const [selectedShopId, setSelectedShopId] = useState(() => {
    return (
      billToEdit?.shop_id ||
      initialShopId ||
      session?.shop_id ||
      warehouse?.id ||
      (shops && shops.length > 0 ? shops[0].id : '')
    );
  });

  useEffect(() => {
    if (billToEdit?.shop_id) {
      setSelectedShopId(billToEdit.shop_id);
    } else if (initialShopId) {
      setSelectedShopId(initialShopId);
    } else if (session?.shop_id) {
      setSelectedShopId(session.shop_id);
    } else if (warehouse?.id && !selectedShopId) {
      setSelectedShopId(warehouse.id);
    } else if (shops && shops.length > 0 && !selectedShopId) {
      setSelectedShopId(shops[0].id);
    }
  }, [billToEdit, initialShopId, session?.shop_id, warehouse?.id, shops]);

  useEffect(() => {
    setSuppliersList(initialSuppliers);
  }, [initialSuppliers]);

  useEffect(() => {
    setProductsList(initialProducts);
  }, [initialProducts]);

  // Form fields
  const [supplierId, setSupplierId] = useState('');
  const [billDate, setBillDate] = useState(today());
  const [paymentTerms, setPaymentTerms] = useState(30);
  const [paymentMode, setPaymentMode] = useState('credit');
  const [notes, setNotes] = useState('');
  const [extraCharges, setExtraCharges] = useState('');

  // Hydrate form if editing or reset if new bill
  useEffect(() => {
    if (!isOpen) return;
    if (billToEdit) {
      setSupplierId(billToEdit.supplier_id ? String(billToEdit.supplier_id) : '');
      setBillDate(billToEdit.bill_date ? String(billToEdit.bill_date).slice(0, 10) : today());
      setPaymentTerms(Number(billToEdit.payment_terms_days) || 30);
      setPaymentMode(billToEdit.payment_mode || 'credit');
      setNotes(billToEdit.notes || '');
      setExtraCharges(billToEdit.extra_charges ? String(billToEdit.extra_charges) : '');
      if (billToEdit.shop_id) setSelectedShopId(billToEdit.shop_id);

      (async () => {
        try {
          const res = await api(`/purchase-bills/${billToEdit.id}`);
          if (res && Array.isArray(res.items) && res.items.length > 0) {
            setItems(
              res.items.map((it) => ({
                product_id: it.product_id ? String(it.product_id) : '',
                custom_product_name: it.custom_product_name || '',
                colour: it.colour || '',
                quantity: Number(it.quantity) || 1,
                unit_price: it.unit_price !== null && it.unit_price !== undefined ? it.unit_price : '',
                discount_amount: Number(it.discount_amount || 0),
                default_selling_price: 0,
                showCustomInput: !it.product_id && !!it.custom_product_name,
              }))
            );
          }
        } catch (err) {
          console.warn('Failed to load bill items for edit:', err);
        }
      })();
    } else {
      setSupplierId('');
      setBillDate(today());
      setPaymentTerms(30);
      setPaymentMode('credit');
      setNotes('');
      setExtraCharges('');
      setItems([
        {
          product_id: '',
          custom_product_name: '',
          colour: '',
          quantity: 1,
          unit_price: '',
          discount_amount: 0,
          default_selling_price: 0,
          showCustomInput: false,
        },
      ]);
    }
  }, [isOpen, billToEdit, api]);

  // Items lines
  const [items, setItems] = useState([
    {
      product_id: '',
      custom_product_name: '',
      colour: '',
      quantity: 1,
      unit_price: '',
      discount_amount: 0,
      default_selling_price: 0,
      showCustomInput: false,
    },
  ]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Submodal toggles
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showBatchPickerModal, setShowBatchPickerModal] = useState(false);
  const [breakdownProduct, setBreakdownProduct] = useState(null);
  const [breakdownLineIndex, setBreakdownLineIndex] = useState(null);

  // Keyboard accessibility: Escape to close, Cmd/Ctrl + Enter to submit
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        // Only close if no child submodal is open
        if (!showVendorModal && !showProductModal && !showBatchPickerModal && !breakdownProduct) {
          onClose();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        const submitBtn = document.getElementById('purchase-bill-submit-btn');
        if (submitBtn) submitBtn.click();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showVendorModal, showProductModal, showBatchPickerModal, breakdownProduct, onClose]);

  // Calculate Due Date string and humanized relative days
  const { dueDateStr, dueDateFormatted } = useMemo(() => {
    if (!billDate) return { dueDateStr: '—', dueDateFormatted: '—' };
    const terms = Math.max(0, Number(paymentTerms) || 0);
    const d = new Date(billDate + 'T00:00:00');
    if (isNaN(d.getTime())) return { dueDateStr: '—', dueDateFormatted: '—' };
    d.setDate(d.getDate() + terms);
    const isoStr = d.toISOString().slice(0, 10);
    const formatted = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    return { dueDateStr: isoStr, dueDateFormatted: formatted };
  }, [billDate, paymentTerms]);

  // Format supplier options for combobox
  const supplierOptions = useMemo(() => {
    return suppliersList.map((s) => ({
      id: s.id,
      label: s.name,
      mobile: s.mobile,
      gstin: s.gstin,
      sublabel: [s.mobile, s.gstin, s.address].filter(Boolean).join(' • '),
    }));
  }, [suppliersList]);

  // Format product options for combobox
  const productOptions = useMemo(() => {
    return productsList.map((p) => {
      let colorsList = [];
      const raw = p.colours || p.available_colours;
      if (Array.isArray(raw)) colorsList = raw;
      else if (typeof raw === 'string' && raw.trim()) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) colorsList = parsed;
          else colorsList = raw.split(',');
        } catch {
          colorsList = raw.split(',');
        }
      }

      const cleanColors = colorsList.map((c) => String(c).trim()).filter(Boolean);

      return {
        id: p.id,
        label: p.short_name || p.name,
        brand: p.brand || '',
        category: p.category || '',
        model: p.model || p.full_model_list || '',
        sku: p.sku || p.code || p.part_number || '',
        colors: cleanColors,
        stock: p.stock ?? p.stock_qty ?? p.stockQty,
        purchase_price: p.purchase_price || 0,
        sale_price: p.sale_price || 0,
        sublabel: `Cost: ₹${p.purchase_price || 0} • Sell: ₹${p.sale_price || 0}`,
      };
    });
  }, [productsList]);

  // Keyboard navigation refs across table cells
  const rowRefs = useRef([]);
  const [pendingFocusRowIdx, setPendingFocusRowIdx] = useState(null);

  const setFieldRef = (rowIdx, fieldName, el) => {
    if (!rowRefs.current[rowIdx]) {
      rowRefs.current[rowIdx] = {};
    }
    rowRefs.current[rowIdx][fieldName] = el;
  };

  const focusField = (rowIdx, fieldName) => {
    const target = rowRefs.current[rowIdx]?.[fieldName];
    if (!target) return;
    if (typeof target.focus === 'function') {
      target.focus();
      if (typeof target.select === 'function') {
        target.select();
      }
    }
  };

  const handleLastFieldEnter = (idx) => {
    if (idx === items.length - 1) {
      // Append blank row for fast batch inwarding and focus its product combobox
      addItem();
      setPendingFocusRowIdx(items.length);
    } else {
      // Move to next line item product search
      focusField(idx + 1, 'product');
    }
  };

  useEffect(() => {
    if (pendingFocusRowIdx !== null && pendingFocusRowIdx < items.length) {
      setTimeout(() => {
        focusField(pendingFocusRowIdx, 'product');
        setPendingFocusRowIdx(null);
      }, 50);
    }
  }, [items.length, pendingFocusRowIdx]);

  // Product Finder Dialog (Command Palette Cmd+K) State
  const [finderState, setFinderState] = useState({
    isOpen: false,
    rowIndex: 0,
  });

  const openProductFinder = (rowIndex) => {
    setFinderState({
      isOpen: true,
      rowIndex,
    });
  };

  const closeProductFinder = () => {
    setFinderState((prev) => ({ ...prev, isOpen: false }));
  };

  const handleFinderSelect = (product, isBatch = false) => {
    const currentRowIdx = finderState.rowIndex;
    handleProductSelect(currentRowIdx, product.id, product);

    if (isBatch) {
      // Batch mode: append new row and advance finder to next row immediately
      addItem();
      setFinderState({
        isOpen: true,
        rowIndex: currentRowIdx + 1,
      });
    } else {
      // Single select: close dialog and focus QTY input on current row
      closeProductFinder();
      setTimeout(() => {
        focusField(currentRowIdx, 'qty');
      }, 60);
    }
  };

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handleGlobalFinderKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const emptyIdx = items.findIndex((it) => !it.product_id);
        openProductFinder(emptyIdx !== -1 ? emptyIdx : Math.max(0, items.length - 1));
      }
    };
    window.addEventListener('keydown', handleGlobalFinderKey);
    return () => window.removeEventListener('keydown', handleGlobalFinderKey);
  }, [items]);

  // Item helpers
  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        product_id: '',
        custom_product_name: '',
        colour: '',
        quantity: 1,
        unit_price: '',
        discount_amount: 0,
        default_selling_price: 0,
        showCustomInput: false,
      },
    ]);
  };

  const handleAddNewLine = () => {
    const nextIdx = items.length;
    addItem();
    setTimeout(() => {
      openProductFinder(nextIdx);
    }, 60);
  };

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateItem = (index, field, val) => {
    setItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        return { ...item, [field]: val };
      })
    );
  };

  // Product selection handler
  const handleProductSelect = (index, productId, productOpt) => {
    if (!productId || !productOpt) {
      updateItem(index, 'product_id', '');
      return;
    }

    const prodRecord = productsList.find((p) => String(p.id) === String(productId));
    const cost = prodRecord?.purchase_price ?? productOpt.purchase_price ?? '';
    const sell = prodRecord?.sale_price ?? productOpt.sale_price ?? 0;
    const defaultColor = productOpt.colors && productOpt.colors.length === 1 ? productOpt.colors[0] : '';

    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== index) return it;
        return {
          ...it,
          product_id: productId,
          custom_product_name: '',
          showCustomInput: false,
          colour: defaultColor || it.colour,
          unit_price: cost !== null && cost !== undefined && cost !== 0 ? cost : it.unit_price,
          default_selling_price: sell,
        };
      })
    );

    // Requirement 4: Selecting a product automatically advances focus to Color / Variant
    setTimeout(() => {
      focusField(index, 'color');
    }, 60);
  };

  // When a new vendor is created via QuickAddVendorModal
  const handleVendorCreated = (newVendor) => {
    setSuppliersList((prev) => [newVendor, ...prev]);
    setSupplierId(newVendor.id);
  };

  // When a new product is created via QuickAddProductModal
  const handleProductCreated = (newProduct) => {
    setProductsList((prev) => [newProduct, ...prev]);
    setItems((prev) => {
      const last = prev[prev.length - 1];
      const newItemObj = {
        product_id: newProduct.id,
        custom_product_name: '',
        colour: '',
        quantity: 10,
        unit_price: newProduct.purchase_price || '',
        discount_amount: 0,
        default_selling_price: newProduct.sale_price || 0,
        showCustomInput: false,
      };

      if (last && !last.product_id && !last.custom_product_name) {
        return [...prev.slice(0, prev.length - 1), newItemObj];
      }
      return [...prev, newItemObj];
    });
  };

  // When batch products are selected via BatchProductPickerModal
  const handleAddBatchLines = (newLines) => {
    setItems((prev) => {
      const filtered = prev.filter((it) => it.product_id || it.custom_product_name);
      return [
        ...filtered,
        ...newLines.map((l) => ({
          ...l,
          showCustomInput: false,
        })),
      ];
    });
    setGlobalToast?.({
      type: 'success',
      message: `Added ${newLines.length} product lines to the purchase bill!`,
    });
  };

  // Color breakdown applied
  const handleApplyColorBreakdown = (splitLines) => {
    if (breakdownLineIndex === null) return;
    setItems((prev) => {
      const before = prev.slice(0, breakdownLineIndex);
      const after = prev.slice(breakdownLineIndex + 1);
      return [
        ...before,
        ...splitLines.map((l) => ({ ...l, showCustomInput: false })),
        ...after,
      ];
    });
    setGlobalToast?.({
      type: 'success',
      message: `Split into ${splitLines.length} variant lines!`,
    });
  };

  // Calculations
  const lineSubtotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const q = Number(item.quantity || 0);
      const p = Number(item.unit_price || 0);
      return sum + money(q * p);
    }, 0);
  }, [items]);

  const totalDiscounts = useMemo(() => {
    return items.reduce((sum, item) => {
      return sum + money(Number(item.discount_amount || 0));
    }, 0);
  }, [items]);

  const productsTotal = money(lineSubtotal - totalDiscounts);
  const totalAmount = money(productsTotal + money(extraCharges || 0));

  // Form submission
  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setError(null);

    const validItems = items.filter(
      (item) =>
        (item.product_id || item.custom_product_name?.trim()) &&
        Number(item.quantity) > 0 &&
        Number(item.unit_price) > 0
    );

    if (validItems.length === 0) {
      setError('Please add at least one valid item with quantity and unit purchase price.');
      return;
    }

    const effectiveShop = Number(
      selectedShopId || initialShopId || session?.shop_id || warehouse?.id || (shops && shops[0]?.id)
    );

    if (!effectiveShop || isNaN(effectiveShop) || effectiveShop <= 0) {
      setError('Please select a specific destination shop or warehouse.');
      return;
    }

    setSaving(true);
    try {
      const isEditing = Boolean(billToEdit);
      const endpoint = isEditing ? `/purchase-bills/${billToEdit.id}` : '/purchase-bills';
      const method = isEditing ? 'PUT' : 'POST';

      await api(endpoint, {
        method,
        body: JSON.stringify({
          shop_id: effectiveShop,
          supplier_id: supplierId || null,
          bill_date: billDate,
          payment_terms_days: Number(paymentTerms) || 30,
          payment_mode: paymentMode,
          notes,
          extra_charges: money(extraCharges || 0),
          items: validItems.map((item) => ({
            product_id: item.product_id || null,
            custom_product_name: item.custom_product_name || null,
            colour: item.colour || null,
            quantity: Number(item.quantity),
            unit_price: money(item.unit_price),
            discount_amount: money(item.discount_amount || 0),
          })),
        }),
      });

      setGlobalToast?.({
        type: 'success',
        message: isEditing ? 'Purchase bill updated successfully!' : 'Purchase bill recorded successfully!',
      });
      onSaved && onSaved();
    } catch (err) {
      console.error('Failed to save purchase bill:', err);
      setError(err.message || 'Failed to save purchase bill.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/60 backdrop-blur-md">
      <motion.div
        initial={{ scale: 0.98, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.98, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden text-xs"
      >
        {/* Header: flex-none */}
        <div className="flex-none px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 text-white flex items-center justify-center shadow-md shadow-violet-500/20 shrink-0">
              <ShoppingBag className="w-5 h-5 shrink-0 stroke-[1.75]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold tracking-tight text-zinc-900 dark:text-white">
                  {billToEdit ? `Edit Purchase Bill #${billToEdit.bill_number}` : 'Record Purchase Bill'}
                </h2>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300 border border-violet-200/60 dark:border-violet-800/50 font-semibold">
                  ERP Inward
                </span>

                {/* Destination Location / Shop Selector Badge */}
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700 text-[10.5px]">
                  <Building2 className="w-3 h-3 text-violet-600 dark:text-violet-400 shrink-0" />
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-normal">Inward To:</span>
                  {shops && shops.length > 1 && (role === 'superadmin' || !session?.shop_id) ? (
                    <select
                      value={selectedShopId}
                      onChange={(e) => setSelectedShopId(e.target.value)}
                      className="bg-transparent font-bold text-zinc-900 dark:text-zinc-100 text-[10.5px] outline-hidden cursor-pointer border-none p-0 pr-1"
                    >
                      {warehouse && (
                        <option value={warehouse.id} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-semibold">
                          🏢 {warehouse.name || 'Main Warehouse'}
                        </option>
                      )}
                      {shops
                        .filter((s) => !warehouse || String(s.id) !== String(warehouse.id))
                        .map((s) => (
                          <option key={s.id} value={s.id} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-semibold">
                            🏪 {s.name} {s.location_type === 'warehouse' ? '(Warehouse)' : '(Branch)'}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">
                      {shops.find((s) => String(s.id) === String(selectedShopId))?.name ||
                       (String(selectedShopId) === String(warehouse?.id) ? (warehouse?.name || 'Main Warehouse') : null) ||
                       session?.shop_name ||
                       'Main Warehouse'}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-normal mt-0.5">
                Record inward inventory shipments, batch purchases, and vendor payables
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-medium rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
              ESC
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg p-1.5 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4 shrink-0 stroke-[1.75]" />
            </button>
          </div>
        </div>

        {/* Scrollable Body: flex-1 overflow-y-auto */}
        <form
          id="purchase-bill-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-6 py-5 space-y-6 flex flex-col"
        >
          {/* Error Alert */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 font-medium flex items-center gap-2 shrink-0">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 stroke-[1.75]" />
              <span>{error}</span>
            </div>
          )}

          {/* Top Metadata Card Group */}
          <div className="bg-zinc-50/70 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl p-4 shrink-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
              {/* Vendor / Supplier */}
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 shrink-0 text-zinc-400 stroke-[1.75]" />
                  <span>Vendor / Supplier</span>
                </label>
                <SearchableCombobox
                  options={supplierOptions}
                  value={supplierId}
                  onChange={(val) => setSupplierId(val)}
                  placeholder="Select or search vendor..."
                  searchPlaceholder="Search vendor by name, phone, GST..."
                  actionText="+ Add New Vendor"
                  onAction={() => setShowVendorModal(true)}
                  size="md"
                />
              </div>

              {/* Bill Date */}
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 shrink-0 text-zinc-400 stroke-[1.75]" />
                  <span>Bill Date</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type="date"
                    value={billDate}
                    onChange={(e) => setBillDate(e.target.value)}
                    className="w-full h-10 px-3 border border-zinc-200 dark:border-zinc-800 rounded-lg font-medium text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 focus:border-violet-500 outline-hidden transition-all shadow-2xs text-xs"
                  />
                </div>
              </div>

              {/* Payment Terms */}
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 shrink-0 text-zinc-400 stroke-[1.75]" />
                  <span>Terms (Days)</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    className="w-full h-10 pl-3 pr-24 border border-zinc-200 dark:border-zinc-800 rounded-lg font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 focus:border-violet-500 outline-hidden transition-all shadow-2xs"
                  />
                  <div className="absolute right-2 flex items-center gap-1">
                    {[15, 30, 45].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setPaymentTerms(preset)}
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                          Number(paymentTerms) === preset
                            ? 'bg-violet-100 dark:bg-violet-950/70 text-violet-700 dark:text-violet-300 font-bold'
                            : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        {preset}d
                      </button>
                    ))}
                  </div>
                </div>
                <p className="mt-1 text-[11px] font-mono text-zinc-500 dark:text-zinc-400 truncate">
                  Due: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{dueDateFormatted}</span>
                </p>
              </div>

              {/* Payment Mode */}
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 shrink-0 text-zinc-400 stroke-[1.75]" />
                  <span>Payment Mode</span>
                </label>
                <div className="relative flex items-center">
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    style={{ backgroundImage: 'none' }}
                    className="w-full h-10 pl-3 pr-8 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs font-medium text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 focus:border-violet-500 outline-hidden transition-all shadow-2xs appearance-none cursor-pointer"
                  >
                    <option value="credit">Credit (Payable On Account)</option>
                    <option value="cash">Cash In Hand</option>
                    <option value="upi">UPI / Online</option>
                    <option value="bank">Bank Transfer (NEFT/RTGS)</option>
                    <option value="cheque">Cheque</option>
                  </select>
                  <ChevronDown className="w-4 h-4 shrink-0 stroke-[1.75] text-zinc-400 pointer-events-none absolute right-2.5" />
                </div>
                <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500 truncate">
                  {paymentMode === 'credit' ? 'Posts to Accounts Payable' : 'Direct disbursement'}
                </p>
              </div>
            </div>
          </div>

          {/* Line Items Section */}
          <div className="space-y-3 shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-zinc-900 dark:text-white flex items-center gap-1.5">
                  <Tag className="w-4 h-4 shrink-0 text-violet-600 dark:text-violet-400 stroke-[1.75]" />
                  <span>Line Items &amp; Stock Inward</span>
                </span>
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                  {items.length} {items.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowBatchPickerModal(true)}
                  className="px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-850 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/80 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="Open catalog picker to multi-select products"
                >
                  <Layers className="w-3.5 h-3.5 shrink-0 text-zinc-500 dark:text-zinc-400 stroke-[1.75]" />
                  <span>Browse / Multi-Add</span>
                </button>

                <button
                  type="button"
                  onClick={handleAddNewLine}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500 rounded-lg transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0 stroke-[2]" />
                  <span>Add Line</span>
                </button>
              </div>
            </div>

            {/* Table Container with Horizontal Scroll */}
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-x-auto bg-white dark:bg-zinc-900 shadow-2xs">
              <table className="w-full min-w-[880px] text-left text-xs border-collapse">
                <thead className="bg-zinc-50/80 dark:bg-zinc-900/90 border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-2 w-8 text-center">#</th>
                    <th className="py-2.5 px-3 min-w-[280px]">Product / Model</th>
                    <th className="py-2.5 px-3 w-36">Color / Variant</th>
                    <th className="py-2.5 px-2 w-20 text-right">Qty</th>
                    <th className="py-2.5 px-2 w-28 text-right">Unit Cost</th>
                    <th className="py-2.5 px-2 w-20 text-right">Discount</th>
                    <th className="py-2.5 px-3 w-28 text-right">Total</th>
                    <th className="py-2.5 px-2 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850">
                  {items.map((item, idx) => {
                    const lineQty = Number(item.quantity || 0);
                    const linePrice = Number(item.unit_price || 0);
                    const lineDisc = Number(item.discount_amount || 0);
                    const lineTotal = money(lineQty * linePrice - lineDisc);

                    const productObj = productsList.find((p) => String(p.id) === String(item.product_id));
                    const productOpt = productOptions.find((p) => String(p.id) === String(item.product_id));
                    const hasMultipleColors = productOpt?.colors && productOpt.colors.length > 1;

                    const sellPrice = Number(item.default_selling_price || productObj?.sale_price || 0);
                    const isCostInflated = linePrice > 0 && sellPrice > 0 && linePrice > sellPrice;

                    return (
                      <tr key={idx} className="group hover:bg-zinc-50/70 dark:hover:bg-zinc-850/50 transition-colors">
                        {/* Row # */}
                        <td className="py-2.5 px-2 w-8 text-center text-zinc-400 dark:text-zinc-500 font-mono text-[11px]">
                          {idx + 1}
                        </td>

                        {/* Product / Model Cell (Passive trigger with Command Palette Finder) */}
                        <td className="py-2.5 px-3 min-w-[280px]">
                          <ProductTableCell
                            ref={(el) => setFieldRef(idx, 'product', el)}
                            product={productOpt}
                            onClick={() => openProductFinder(idx)}
                            onClear={() => handleProductSelect(idx, '', null)}
                            placeholder="Search model, brand, or SKU..."
                          />

                          {/* Secondary Custom Name toggle/display */}
                          {!item.product_id && (
                            <div className="mt-1.5">
                              <input
                                type="text"
                                value={item.custom_product_name}
                                onChange={(e) => updateItem(idx, 'custom_product_name', e.target.value)}
                                placeholder="Type custom item description or model..."
                                className="w-full h-8 px-2.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-medium text-zinc-800 dark:text-zinc-200 bg-zinc-50/50 dark:bg-zinc-800/40 focus:bg-white dark:focus:bg-zinc-900 focus:border-violet-500 outline-hidden"
                              />
                            </div>
                          )}

                          {item.product_id && (
                            <div className="mt-1 flex items-center justify-between text-[10px]">
                              {item.showCustomInput ? (
                                <div className="w-full flex items-center gap-1.5">
                                  <CornerDownRight className="w-3 h-3 text-zinc-400 shrink-0 stroke-[1.75]" />
                                  <input
                                    type="text"
                                    value={item.custom_product_name}
                                    onChange={(e) => updateItem(idx, 'custom_product_name', e.target.value)}
                                    placeholder="Add specific line note or IMEI / batch..."
                                    className="w-full h-7 px-2 border border-zinc-200 dark:border-zinc-700 rounded-md text-[11px] text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800/40 focus:bg-white dark:focus:bg-zinc-900 outline-hidden"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateItem(idx, 'showCustomInput', false)}
                                    className="text-zinc-400 hover:text-zinc-600 p-0.5 cursor-pointer"
                                  >
                                    <X className="w-3 h-3 shrink-0 stroke-[1.75]" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => updateItem(idx, 'showCustomInput', true)}
                                  className="text-[10.5px] text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 font-medium transition-colors cursor-pointer"
                                >
                                  + Add line note / batch memo
                                </button>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Color / Variant */}
                        <td className="py-2.5 px-3 w-36">
                          <div className="flex items-center gap-1.5">
                            {productOpt?.colors && productOpt.colors.length > 0 ? (
                              <div className="relative w-full">
                                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none flex items-center">
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${getColorDot(item.colour)}`} />
                                </div>
                                <select
                                  ref={(el) => setFieldRef(idx, 'color', el)}
                                  value={item.colour || ''}
                                  onChange={(e) => updateItem(idx, 'colour', e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      focusField(idx, 'qty');
                                    }
                                  }}
                                  style={{ backgroundImage: 'none' }}
                                  className="w-full h-9 pl-6 pr-6 border border-zinc-200 dark:border-zinc-800 rounded-lg font-semibold text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 focus:border-violet-500 outline-hidden text-xs appearance-none transition-all cursor-pointer shadow-2xs"
                                >
                                  <option value="" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-medium">Universal</option>
                                  {productOpt.colors.map((c) => (
                                    <option key={c} value={c} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-semibold">
                                      {c}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown className="w-3.5 h-3.5 shrink-0 stroke-[1.75] text-zinc-400 pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
                              </div>
                            ) : (
                              <div className="relative w-full">
                                {item.colour && (
                                  <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none flex items-center">
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${getColorDot(item.colour)}`} />
                                  </div>
                                )}
                                <input
                                  ref={(el) => setFieldRef(idx, 'color', el)}
                                  type="text"
                                  value={item.colour || ''}
                                  onChange={(e) => updateItem(idx, 'colour', e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      focusField(idx, 'qty');
                                    }
                                  }}
                                  placeholder="Universal"
                                  className={`w-full h-9 ${item.colour ? 'pl-6' : 'pl-2.5'} pr-2 border border-zinc-200 dark:border-zinc-800 rounded-lg font-semibold text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 focus:border-violet-500 outline-hidden text-xs shadow-2xs`}
                                />
                              </div>
                            )}

                            {/* Multi-Color Breakdown Icon */}
                            {hasMultipleColors && (
                              <button
                                type="button"
                                onClick={() => {
                                  setBreakdownProduct(productObj);
                                  setBreakdownLineIndex(idx);
                                }}
                                className="w-9 h-9 flex items-center justify-center rounded-lg bg-pink-50 hover:bg-pink-100 dark:bg-pink-950/40 dark:hover:bg-pink-950/70 text-pink-700 dark:text-pink-300 border border-pink-200/80 dark:border-pink-800/60 transition-colors cursor-pointer shrink-0"
                                title="Enter quantities for each color variant at once"
                              >
                                <Palette className="w-4 h-4 shrink-0 stroke-[1.75]" />
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Quantity */}
                        <td className="py-2.5 px-2 w-20 text-right">
                          <input
                            ref={(el) => setFieldRef(idx, 'qty', el)}
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                focusField(idx, 'cost');
                              }
                            }}
                            className="w-full h-9 px-2 border border-zinc-200 dark:border-zinc-800 rounded-lg font-mono font-semibold text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 focus:border-violet-500 outline-hidden text-right text-xs shadow-2xs"
                          />
                        </td>

                        {/* Unit Cost with CurrencyInput */}
                        <td className="py-2.5 px-2 w-28 text-right">
                          <div className="space-y-1">
                            <CurrencyInput
                              ref={(el) => setFieldRef(idx, 'cost', el)}
                              size="sm"
                              value={item.unit_price}
                              onChange={(e) => updateItem(idx, 'unit_price', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleLastFieldEnter(idx);
                                }
                              }}
                              placeholder="0.00"
                              isWarning={isCostInflated}
                              warningMessage={`> Sell ₹${sellPrice}`}
                              className="w-full"
                            />
                            {!isCostInflated && sellPrice > 0 && linePrice > 0 && (
                              <div className="text-[9.5px] font-mono text-emerald-600 dark:text-emerald-400 text-right truncate">
                                +{Math.round(((sellPrice - linePrice) / sellPrice) * 100)}% (Sell ₹{sellPrice})
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Discount with CurrencyInput */}
                        <td className="py-2.5 px-2 w-20 text-right">
                          <CurrencyInput
                            ref={(el) => setFieldRef(idx, 'discount', el)}
                            size="sm"
                            value={item.discount_amount}
                            onChange={(e) => updateItem(idx, 'discount_amount', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleLastFieldEnter(idx);
                              }
                            }}
                            placeholder="0.00"
                            className="w-full"
                          />
                        </td>

                        {/* Line Total */}
                        <td className="py-2.5 px-3 w-28 text-right font-mono font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                          {currency(lineTotal)}
                        </td>

                        {/* Trash / Delete Row */}
                        <td className="py-2.5 px-2 w-10 text-center">
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeItem(idx)}
                              className="w-8 h-8 mx-auto flex items-center justify-center opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all cursor-pointer"
                              title="Remove line item"
                            >
                              <Trash2 className="w-4 h-4 shrink-0 stroke-[1.75]" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Financial & Notes Summary Section */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-2 border-t border-zinc-200/80 dark:border-zinc-800/80 items-start shrink-0">
            {/* Left Zone: Freight & Memo */}
            <div className="md:col-span-7 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Percent className="w-4 h-4 shrink-0 text-zinc-400 stroke-[1.75]" />
                    <span>Freight / Extra Charges</span>
                  </label>
                  <CurrencyInput
                    size="md"
                    value={extraCharges}
                    onChange={(e) => setExtraCharges(e.target.value)}
                    placeholder="0.00"
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 shrink-0 text-zinc-400 stroke-[1.75]" />
                    <span>Inward Tracking / Memo</span>
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Courier LR #4829, Carton 3 of 4"
                    className="w-full h-10 px-3 border border-zinc-200 dark:border-zinc-800 rounded-lg font-medium text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 focus:border-violet-500 outline-hidden transition-all shadow-2xs text-xs"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/60 text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                <Info className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0 stroke-[1.75]" />
                <span>
                  All inward lines will automatically increment warehouse inventory and credit the vendor ledger.
                </span>
              </div>
            </div>

            {/* Right Zone: Stacked Financial Receipt Summary */}
            <div className="md:col-span-5 flex justify-end">
              <div className="w-full sm:w-80 bg-zinc-50/80 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl p-4 space-y-2.5 shadow-2xs">
                <div className="flex justify-between text-zinc-500 dark:text-zinc-400 text-xs">
                  <span>Line Items Subtotal</span>
                  <span className="font-mono text-zinc-800 dark:text-zinc-200 font-medium">
                    {currency(lineSubtotal)}
                  </span>
                </div>

                {totalDiscounts > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                    <span>Total Discount</span>
                    <span className="font-mono">-{currency(totalDiscounts)}</span>
                  </div>
                )}

                {Number(extraCharges || 0) > 0 && (
                  <div className="flex justify-between text-zinc-600 dark:text-zinc-400 text-xs">
                    <span>Freight / Extra Charges</span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-200 font-medium">
                      +{currency(extraCharges)}
                    </span>
                  </div>
                )}

                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-baseline">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                    Grand Bill Total
                  </span>
                  <span className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white font-mono">
                    {currency(totalAmount)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* Footer: flex-none pinned at the bottom */}
        <div className="flex-none px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex items-center justify-between">
          <div className="hidden sm:flex items-center gap-1.5 text-zinc-400 dark:text-zinc-500 text-[11px] font-mono">
            <span>Press</span>
            <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 font-semibold shadow-2xs">
              Ctrl
            </kbd>
            <span>+</span>
            <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 font-semibold shadow-2xs">
              Enter
            </kbd>
            <span>to record bill</span>
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              id="purchase-bill-submit-btn"
              type="submit"
              form="purchase-bill-form"
              disabled={saving}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500 rounded-lg shadow-sm shadow-violet-500/20 active:scale-[0.99] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                  <span>{billToEdit ? 'Updating Bill...' : 'Recording Bill...'}</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 shrink-0 stroke-[2]" />
                  <span>{billToEdit ? `Update Bill (${currency(totalAmount)})` : `Record Purchase Bill (${currency(totalAmount)})`}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Submodals */}
      <ProductSearchDialog
        isOpen={finderState.isOpen}
        onClose={closeProductFinder}
        products={productOptions}
        onSelect={handleFinderSelect}
        activeRowIndex={finderState.rowIndex}
        onCreateNewProduct={() => setShowProductModal(true)}
      />

      {showVendorModal && (
        <QuickAddVendorModal
          isOpen={showVendorModal}
          onClose={() => setShowVendorModal(false)}
          onVendorCreated={handleVendorCreated}
          api={api}
          setGlobalToast={setGlobalToast}
        />
      )}

      {showProductModal && (
        <QuickAddProductModal
          isOpen={showProductModal}
          onClose={() => setShowProductModal(false)}
          onProductCreated={handleProductCreated}
          api={api}
          categories={Array.from(new Set(productsList.map((p) => p.category).filter(Boolean))).map((c) => ({ name: c }))}
          brands={Array.from(new Set(productsList.map((p) => p.brand).filter(Boolean))).map((b) => ({ name: b }))}
          setGlobalToast={setGlobalToast}
        />
      )}

      {showBatchPickerModal && (
        <BatchProductPickerModal
          isOpen={showBatchPickerModal}
          onClose={() => setShowBatchPickerModal(false)}
          products={productsList}
          onAddSelectedLines={handleAddBatchLines}
        />
      )}

      {Boolean(breakdownProduct) && (
        <ColorBreakdownPopover
          isOpen={Boolean(breakdownProduct)}
          onClose={() => {
            setBreakdownProduct(null);
            setBreakdownLineIndex(null);
          }}
          product={breakdownProduct}
          currentPrice={breakdownLineIndex !== null ? items[breakdownLineIndex]?.unit_price : ''}
          onApplyLines={handleApplyColorBreakdown}
        />
      )}
    </div>
  );
}

