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
import SearchableCombobox from '../ui/SearchableCombobox';
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

const extractProductColors = (product) => {
  if (!product) return [];
  const colorSet = new Set();

  const addColor = (c) => {
    if (!c) return;
    const str = String(c).replace(/[{}"']/g, '').trim();
    if (
      !str ||
      str.toLowerCase() === 'undefined' ||
      str.toLowerCase() === 'null' ||
      str.toLowerCase() === 'standard' ||
      str.toLowerCase() === 'default'
    )
      return;
    colorSet.add(str);
  };

  // 1. From available_colours or available_colors
  const rawAvail = product.available_colours || product.available_colors;
  if (Array.isArray(rawAvail)) {
    rawAvail.forEach(addColor);
  } else if (typeof rawAvail === 'string' && rawAvail.trim()) {
    try {
      const parsed = JSON.parse(rawAvail);
      if (Array.isArray(parsed)) parsed.forEach(addColor);
      else rawAvail.replace(/[{}]/g, '').split(',').forEach(addColor);
    } catch {
      rawAvail.replace(/[{}]/g, '').split(',').forEach(addColor);
    }
  }

  // 2. From colours or colors
  const rawColours = product.colours || product.colors;
  if (Array.isArray(rawColours)) {
    rawColours.forEach(addColor);
  } else if (typeof rawColours === 'string' && rawColours.trim()) {
    try {
      const parsed = JSON.parse(rawColours);
      if (Array.isArray(parsed)) parsed.forEach(addColor);
      else rawColours.replace(/[{}]/g, '').split(',').forEach(addColor);
    } catch {
      rawColours.replace(/[{}]/g, '').split(',').forEach(addColor);
    }
  }

  // 3. From colour_stock keys
  if (product.colour_stock && typeof product.colour_stock === 'object') {
    Object.keys(product.colour_stock).forEach(addColor);
  } else if (typeof product.colour_stock === 'string' && product.colour_stock.trim()) {
    try {
      const parsed = JSON.parse(product.colour_stock);
      if (typeof parsed === 'object' && parsed !== null) {
        Object.keys(parsed).forEach(addColor);
      }
    } catch { /* ignore */ }
  }

  // 4. From supplier_batches
  if (Array.isArray(product.supplier_batches)) {
    product.supplier_batches.forEach((b) => {
      if (b?.colour) addColor(b.colour);
    });
  }

  // 5. Genuine color properties
  if (product.color) addColor(product.color);
  if (product.colour) addColor(product.colour);

  return Array.from(colorSet);
};

export default function NewPurchaseBillModal({
  isOpen,
  billToEdit = null,
  onClose,
  onSaved,
  suppliers: initialSuppliers = [],
  products: initialProducts = [],
  reference = null,
  brands = [],
  categories = [],
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
    if (initialSuppliers && initialSuppliers.length > 0) {
      setSuppliersList(initialSuppliers);
    }
  }, [initialSuppliers]);

  useEffect(() => {
    if (initialProducts && initialProducts.length > 0) {
      setProductsList(initialProducts);
    }
  }, [initialProducts]);

  // Load full product catalog (5000 limit) so all brands and models are accessible
  useEffect(() => {
    if (!isOpen || !api) return;
    let isMounted = true;
    (async () => {
      try {
        const res = await api('/products?limit=5000');
        const items = Array.isArray(res) ? res : (res?.data || []);
        if (isMounted && Array.isArray(items) && items.length > 0) {
          setProductsList(items);
        }
      } catch (err) {
        console.warn('[NewPurchaseBillModal] Failed to load full products catalog:', err);
      }
    })();
    return () => { isMounted = false; };
  }, [isOpen, api]);

  // Load suppliers from reference data to ensure vendor list is always populated
  useEffect(() => {
    if (!isOpen || !api) return;
    let isMounted = true;
    (async () => {
      try {
        const refRes = await api('/reference-data');
        const list = refRes?.suppliers || [];
        if (isMounted && Array.isArray(list) && list.length > 0) {
          setSuppliersList(list);
        }
      } catch (err) {
        console.warn('[NewPurchaseBillModal] Failed to load suppliers list:', err);
      }
    })();
    return () => { isMounted = false; };
  }, [isOpen, api]);

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
    return (suppliersList || []).map((s) => ({
      id: s.id,
      name: s.name || `Vendor #${s.id}`,
      mobile: s.mobile || '',
      gstin: s.gstin || '',
      address: s.address || '',
      isVendor: true,
      keywords: [s.name, s.mobile, s.gstin, s.address].filter(Boolean).join(' '),
    }));
  }, [suppliersList]);

  // Format product options for combobox
  const productOptions = useMemo(() => {
    return productsList.map((p) => {
      const cleanColors = extractProductColors(p);
      const title = p.short_name || p.name || 'Product';
      const brand = p.brand || '';
      const cat = p.category || p.part_category || '';
      const model = p.model || p.full_model_list || '';
      const stock = p.stock ?? p.stock_qty ?? p.stockQty;

      return {
        id: p.id,
        name: title,
        label: title,
        brand,
        category: cat,
        model,
        stock,
        coloursCount: cleanColors.length,
        colors: cleanColors,
        image_url: p.image_url || p.imageUrl || '',
        purchase_price: p.purchase_price || 0,
        sale_price: p.sale_price || 0,
        keywords: [title, brand, cat, model, p.sku, p.code, p.part_number].filter(Boolean).join(' '),
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
    if (fieldName === 'product') {
      const btn = document.getElementById(`bill-product-combobox-${rowIdx}`);
      if (btn) {
        btn.focus();
        btn.click();
        return;
      }
    }
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

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handleGlobalFinderKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const emptyIdx = items.findIndex((it) => !it.product_id);
        focusField(emptyIdx !== -1 ? emptyIdx : Math.max(0, items.length - 1), 'product');
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
      focusField(nextIdx, 'product');
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
  const handleProductSelect = (index, productId, productOpt = null, chosenColor = null) => {
    if (!productId) {
      updateItem(index, 'product_id', '');
      return;
    }

    const opt = productOpt || productOptions.find((p) => String(p.id) === String(productId));
    const prodRecord = productsList.find((p) => String(p.id) === String(productId));
    const cost = prodRecord?.purchase_price ?? opt?.purchase_price ?? '';
    const sell = prodRecord?.sale_price ?? opt?.sale_price ?? 0;
    const colors = opt?.colors || extractProductColors(prodRecord) || [];
    const hasColors = colors.length > 0;
    const defaultColor = chosenColor || (colors.length === 1 ? colors[0] : '');

    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== index) return it;
        return {
          ...it,
          product_id: productId,
          custom_product_name: '',
          showCustomInput: false,
          colour: hasColors ? (defaultColor || it.colour) : '',
          unit_price: cost !== null && cost !== undefined && cost !== 0 ? cost : it.unit_price,
          default_selling_price: sell,
        };
      })
    );

    // If product has no colors OR a color was already chosen -> advance straight to qty!
    setTimeout(() => {
      if (!hasColors || chosenColor) {
        focusField(index, 'qty');
      } else {
        focusField(index, 'color');
      }
    }, 60);
  };

  // When a new vendor is created via QuickAddVendorModal
  const handleVendorCreated = (newVendor) => {
    if (newVendor) {
      setSuppliersList((prev) => [newVendor, ...prev.filter((v) => String(v.id) !== String(newVendor.id))]);
      setSupplierId(String(newVendor.id));
    }
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

  const totalUnits = useMemo(() => {
    return items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-zinc-950/65 backdrop-blur-md">
      <motion.div
        initial={{ scale: 0.98, opacity: 0, y: 6 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.98, opacity: 0, y: 6 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        className="bg-white dark:bg-zinc-950 border border-zinc-200/90 dark:border-zinc-800/90 shadow-2xl rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden text-xs"
      >
        {/* Header: flex-none */}
        <div className="flex-none px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50/60 dark:bg-zinc-900/40">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-md shadow-violet-500/25 shrink-0">
              <ShoppingBag className="w-5 h-5 shrink-0 stroke-[2]" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-white">
                  {billToEdit ? `Edit Purchase Bill #${billToEdit.bill_number}` : 'Record Purchase Bill'}
                </h2>
                <span className="font-mono text-[10px] px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950/70 dark:text-violet-300 border border-violet-200 dark:border-violet-800 font-bold">
                  ERP Inward
                </span>

                {/* Destination Location / Shop Selector Badge */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800/90 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 text-xs shadow-2xs">
                  <Building2 className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
                  <span className="text-[10.5px] text-zinc-400 dark:text-zinc-500 font-medium">Inward To:</span>
                  {shops && shops.length > 1 && (role === 'superadmin' || !session?.shop_id) ? (
                    <select
                      value={selectedShopId}
                      onChange={(e) => setSelectedShopId(e.target.value)}
                      className="bg-transparent font-bold text-zinc-900 dark:text-zinc-100 text-xs outline-hidden cursor-pointer border-none p-0 pr-1"
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
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-normal mt-0.5">
                Record inward inventory shipments, batch purchases, and vendor payables
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-mono font-medium rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border border-zinc-200 dark:border-zinc-700/80">
              ESC
            </kbd>
            <button
              type="button"
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl p-2 transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-4 h-4 stroke-[2]" />
            </button>
          </div>
        </div>

        {/* Scrollable Body: flex-1 overflow-y-auto */}
        <form
          id="purchase-bill-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-6 py-5 space-y-6 flex flex-col scrollbar-thin"
        >
          {/* Error Alert */}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 font-medium flex items-center gap-2.5 shrink-0 shadow-2xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 stroke-[2]" />
              <span>{error}</span>
            </div>
          )}

          {/* Top Metadata Card Group */}
          <div className="bg-gradient-to-b from-zinc-50/80 to-white dark:from-zinc-900/60 dark:to-zinc-900/40 border border-zinc-200/90 dark:border-zinc-800/90 rounded-2xl p-4.5 shadow-2xs shrink-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5 items-start">
              {/* Vendor / Supplier */}
              <div>
                <label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 shrink-0 text-violet-500 stroke-[2]" />
                  <span>Vendor / Supplier</span>
                </label>
                <SearchableCombobox
                  options={supplierOptions}
                  value={supplierId}
                  onChange={(val) => setSupplierId(val)}
                  placeholder="Select or search vendor..."
                  searchPlaceholder="Search vendor by name, phone, GST..."
                  onAddNew={() => setShowVendorModal(true)}
                  addNewLabel="+ Add New Vendor"
                  usePortal={true}
                  className="w-full"
                />
              </div>

              {/* Bill Date */}
              <div>
                <label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 shrink-0 text-violet-500 stroke-[2]" />
                  <span>Bill Date</span>
                </label>
                <input
                  type="date"
                  value={billDate}
                  onChange={(e) => setBillDate(e.target.value)}
                  className="w-full h-10 px-3 border border-zinc-200 dark:border-zinc-800 rounded-xl font-medium text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-hidden transition-all shadow-2xs text-xs"
                />
              </div>

              {/* Payment Terms */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 shrink-0 text-violet-500 stroke-[2]" />
                    <span>Terms (Days)</span>
                  </label>
                  <span className="text-[10.5px] font-mono text-zinc-400 dark:text-zinc-500">
                    Due: <strong className="text-zinc-700 dark:text-zinc-300 font-semibold">{dueDateFormatted}</strong>
                  </span>
                </div>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    className="w-full h-10 pl-3 pr-24 border border-zinc-200 dark:border-zinc-800 rounded-xl font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-hidden transition-all shadow-2xs"
                  />
                  <div className="absolute right-1.5 flex items-center gap-1">
                    {[15, 30, 45].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setPaymentTerms(preset)}
                        className={`text-[10.5px] font-mono px-1.5 py-0.5 rounded-lg cursor-pointer transition-all font-semibold ${
                          Number(paymentTerms) === preset
                            ? 'bg-violet-600 text-white shadow-2xs'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                        }`}
                      >
                        {preset}d
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Payment Mode */}
              <div>
                <label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 shrink-0 text-violet-500 stroke-[2]" />
                  <span>Payment Mode</span>
                </label>
                <div className="relative flex items-center">
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    style={{ backgroundImage: 'none' }}
                    className="w-full h-10 pl-3 pr-8 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-hidden transition-all shadow-2xs appearance-none cursor-pointer"
                  >
                    <option value="credit">Credit (On Account Payable)</option>
                    <option value="cash">Cash In Hand</option>
                    <option value="upi">UPI / Online</option>
                    <option value="bank">Bank Transfer (NEFT/RTGS)</option>
                    <option value="cheque">Cheque</option>
                  </select>
                  <ChevronDown className="w-4 h-4 shrink-0 stroke-[1.75] text-zinc-400 pointer-events-none absolute right-2.5" />
                </div>
              </div>
            </div>
          </div>

          {/* Line Items Section */}
          <div className="space-y-3 shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center border border-violet-200/80 dark:border-violet-800/60 shadow-2xs">
                  <Tag className="w-3.5 h-3.5 stroke-[2]" />
                </div>
                <div>
                  <div className="font-bold text-xs text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
                    <span>Line Items &amp; Stock Inward</span>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200/90 dark:border-zinc-700">
                      {items.length} {items.length === 1 ? 'item' : 'items'} • {totalUnits} {totalUnits === 1 ? 'unit' : 'units'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowBatchPickerModal(true)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-850 hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-2xs hover:shadow-xs active:scale-[0.98]"
                  title="Open catalog picker to multi-select products"
                >
                  <Layers className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 stroke-[2]" />
                  <span>Catalog Multi-Add</span>
                </button>

                <button
                  type="button"
                  onClick={handleAddNewLine}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-[0.98]"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Add Row</span>
                </button>
              </div>
            </div>

            {/* Table Container - responsive and fits max-w-6xl cleanly without scrollbar */}
            <div className="border border-zinc-200/90 dark:border-zinc-800 rounded-2xl overflow-hidden bg-white dark:bg-zinc-900 shadow-2xs">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-zinc-50/90 dark:bg-zinc-850/80 border-b border-zinc-200/90 dark:border-zinc-800 text-[10.5px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">#</th>
                      <th className="py-2.5 px-3 min-w-[260px]">Product / Model</th>
                      <th className="py-2.5 px-3 w-40">Color / Variant</th>
                      <th className="py-2.5 px-2 w-20 text-center">Qty</th>
                      <th className="py-2.5 px-2 w-32 text-right">Unit Cost</th>
                      <th className="py-2.5 px-2 w-24 text-right">Discount</th>
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
                        <tr key={idx} className="group hover:bg-zinc-50/60 dark:hover:bg-zinc-850/40 transition-colors">
                          {/* Row # */}
                          <td className="py-3 px-3 w-10 text-center">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] font-mono font-bold text-zinc-500 dark:text-zinc-400 select-none">
                              {idx + 1}
                            </span>
                          </td>

                          {/* Product / Model Cell */}
                          <td className="py-2.5 px-3 min-w-[280px]">
                            <SearchableCombobox
                              id={`bill-product-combobox-${idx}`}
                              value={item.product_id}
                              onChange={(val) => {
                                const prodOpt = productOptions.find((p) => String(p.id) === String(val));
                                handleProductSelect(idx, val, prodOpt);
                              }}
                              options={productOptions}
                              placeholder="Search model, brand, or SKU..."
                              searchPlaceholder="Type model, OLED, battery, brand..."
                              dropdownWidth="min-w-full sm:min-w-[540px] md:min-w-[620px] max-w-[min(720px,94vw)]"
                              className="w-full"
                              allowClear
                              usePortal={true}
                              onAddNew={() => setShowProductModal(true)}
                              addNewLabel="+ Create New Product"
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
                          <td className="py-3 px-3 w-40">
                            <div className="flex items-center gap-1.5">
                              <div className="relative w-full">
                                {item.colour && (
                                  <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none flex items-center">
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${getColorDot(item.colour)}`} />
                                  </div>
                                )}
                                <input
                                  ref={(el) => setFieldRef(idx, 'color', el)}
                                  type="text"
                                  list={`color-options-${idx}`}
                                  value={item.colour || ''}
                                  onChange={(e) => updateItem(idx, 'colour', e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      focusField(idx, 'qty');
                                    }
                                  }}
                                  placeholder="Color (Optional)"
                                  className={`w-full h-9 ${item.colour ? 'pl-6' : 'pl-2.5'} pr-2 border border-zinc-200 dark:border-zinc-800 rounded-xl font-semibold text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-hidden text-xs transition-all shadow-2xs`}
                                />
                                <datalist id={`color-options-${idx}`}>
                                  {(productOpt?.colors || []).map((c) => (
                                    <option key={c} value={c} />
                                  ))}
                                  {['Black', 'White', 'Blue', 'Gold', 'Silver', 'Green', 'Purple', 'Red', 'Grey', 'Orange'].map((c) => (
                                    <option key={c} value={c} />
                                  ))}
                                </datalist>
                              </div>

                              {/* Multi-Color Breakdown Icon */}
                              {productObj && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBreakdownProduct(productObj);
                                    setBreakdownLineIndex(idx);
                                  }}
                                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-pink-50 hover:bg-pink-100 dark:bg-pink-950/40 dark:hover:bg-pink-950/70 text-pink-700 dark:text-pink-300 border border-pink-200/80 dark:border-pink-800/60 transition-colors cursor-pointer shrink-0 shadow-2xs"
                                  title="Enter quantities for each color variant at once"
                                >
                                  <Palette className="w-4 h-4 shrink-0 stroke-[1.75]" />
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Quantity */}
                          <td className="py-3 px-2 w-20 text-center">
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
                              className="w-full h-9 px-2 text-center border border-zinc-200 dark:border-zinc-800 rounded-xl font-mono font-bold text-xs text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-hidden transition-all shadow-2xs"
                            />
                          </td>

                          {/* Unit Cost with CurrencyInput */}
                          <td className="py-3 px-2 w-32 text-right">
                            <div>
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
                                <div className="mt-1 flex items-center justify-end">
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-mono text-[9px] font-bold border border-emerald-200/60 dark:border-emerald-800/50">
                                    +{Math.round(((sellPrice - linePrice) / sellPrice) * 100)}% (Sell ₹{sellPrice})
                                  </span>
                                </div>
                              )}
                              {isCostInflated && (
                                <div className="mt-1 flex items-center justify-end">
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 font-mono text-[9px] font-bold border border-rose-200/60 dark:border-rose-800/50">
                                    <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                    &gt; Sell ₹{sellPrice}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Discount with CurrencyInput */}
                          <td className="py-3 px-2 w-24 text-right">
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
                          <td className="py-3 px-3 w-28 text-right font-mono font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap text-sm tracking-tight">
                            {currency(lineTotal)}
                          </td>

                          {/* Trash / Delete Row */}
                          <td className="py-3 px-2 w-10 text-center">
                            {items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeItem(idx)}
                                className="w-8 h-8 mx-auto flex items-center justify-center text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-all cursor-pointer opacity-70 group-hover:opacity-100"
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
          </div>

          {/* Bottom Financial & Notes Summary Section */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-3 border-t border-zinc-200/80 dark:border-zinc-800/80 items-start shrink-0">
            {/* Left Zone: Freight & Memo */}
            <div className="lg:col-span-7 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5 shrink-0 text-violet-500 stroke-[2]" />
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
                  <label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 shrink-0 text-violet-500 stroke-[2]" />
                    <span>Inward Tracking / Memo</span>
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Courier LR #4829, Carton 3 of 4"
                    className="w-full h-10 px-3.5 border border-zinc-200 dark:border-zinc-800 rounded-xl font-medium text-xs text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-hidden transition-all shadow-2xs"
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-violet-50/70 to-indigo-50/40 dark:from-violet-950/20 dark:to-indigo-950/10 border border-violet-100/90 dark:border-violet-900/40 text-[11.5px] text-zinc-600 dark:text-zinc-300 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0 stroke-[2] mt-0.5" />
                <div className="leading-relaxed">
                  <strong className="font-semibold text-zinc-900 dark:text-zinc-100">Automated Ledger &amp; Inventory Sync: </strong>
                  <span>All received items immediately increment stock at the destination facility and register on the vendor&apos;s payable ledger.</span>
                </div>
              </div>
            </div>

            {/* Right Zone: Stacked Financial Receipt Summary */}
            <div className="lg:col-span-5 flex justify-end">
              <div className="w-full sm:w-88 bg-gradient-to-b from-zinc-50/90 to-zinc-100/50 dark:from-zinc-900/90 dark:to-zinc-850/50 border border-zinc-200/90 dark:border-zinc-800/90 rounded-2xl p-4.5 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-200/80 dark:border-zinc-800/80">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Bill Breakdown
                  </span>
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700">
                    {items.length} {items.length === 1 ? 'line' : 'lines'} • {totalUnits} {totalUnits === 1 ? 'unit' : 'units'}
                  </span>
                </div>

                <div className="flex justify-between text-zinc-600 dark:text-zinc-400 text-xs">
                  <span>Line Items Subtotal</span>
                  <span className="font-mono text-zinc-900 dark:text-zinc-100 font-semibold">
                    {currency(lineSubtotal)}
                  </span>
                </div>

                {totalDiscounts > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                    <span>Total Discounts</span>
                    <span className="font-mono">-{currency(totalDiscounts)}</span>
                  </div>
                )}

                {Number(extraCharges || 0) > 0 && (
                  <div className="flex justify-between text-zinc-600 dark:text-zinc-400 text-xs">
                    <span>Freight &amp; Charges</span>
                    <span className="font-mono text-zinc-900 dark:text-zinc-100 font-semibold">
                      +{currency(extraCharges)}
                    </span>
                  </div>
                )}

                <div className="pt-2.5 border-t border-zinc-200 dark:border-zinc-800">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                      Grand Total
                    </span>
                    <span className="text-2xl font-black font-mono tracking-tight text-violet-700 dark:text-violet-400">
                      {currency(totalAmount)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
                    <span>MODE: <strong className="text-zinc-600 dark:text-zinc-300 uppercase">{paymentMode}</strong></span>
                    <span>DUE: <strong className="text-zinc-600 dark:text-zinc-300">{dueDateFormatted}</strong></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* Footer: flex-none pinned at the bottom */}
        <div className="flex-none px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 flex items-center justify-between">
          <div className="hidden sm:flex items-center gap-1.5 text-zinc-400 dark:text-zinc-500 text-[11px] font-mono">
            <span>Press</span>
            <kbd className="px-1.5 py-0.5 rounded-md bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold shadow-2xs">
              Ctrl
            </kbd>
            <span>+</span>
            <kbd className="px-1.5 py-0.5 rounded-md bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold shadow-2xs">
              Enter
            </kbd>
            <span>to record</span>
            <span className="text-zinc-300 dark:text-zinc-600">•</span>
            <kbd className="px-1.5 py-0.5 rounded-md bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold shadow-2xs">
              Esc
            </kbd>
            <span>to cancel</span>
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              id="purchase-bill-submit-btn"
              type="submit"
              form="purchase-bill-form"
              disabled={saving}
              className="px-6 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 active:scale-[0.98] rounded-xl shadow-md shadow-violet-500/25 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                  <span>{billToEdit ? 'Updating Bill...' : 'Recording Bill...'}</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 shrink-0 stroke-[2.5]" />
                  <span>{billToEdit ? `Update Bill (${currency(totalAmount)})` : `Record Purchase Bill (${currency(totalAmount)})`}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Submodals */}

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
          categories={categories?.length ? categories : (reference?.categories || Array.from(new Set(productsList.map((p) => p.category).filter(Boolean))).map((c) => ({ name: c })))}
          brands={brands?.length ? brands : (reference?.brands || Array.from(new Set(productsList.map((p) => p.brand).filter(Boolean))).map((b) => ({ name: b })))}
          setGlobalToast={setGlobalToast}
        />
      )}

      {showBatchPickerModal && (
        <BatchProductPickerModal
          isOpen={showBatchPickerModal}
          onClose={() => setShowBatchPickerModal(false)}
          products={productsList}
          api={api}
          shopId={selectedShopId || initialShopId}
          allBrands={brands?.length ? brands : (reference?.brands || [])}
          allCategories={categories?.length ? categories : (reference?.categories || [])}
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

