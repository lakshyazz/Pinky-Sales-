import React, { useState, useEffect, useMemo } from 'react';
import { 
  Smartphone, 
  LayoutGrid, 
  Send, 
  Filter, 
  Plus, 
  Trash2, 
  Edit3, 
  ChevronDown, 
  ChevronUp, 
  Download, 
  Printer, 
  Save, 
  RefreshCw, 
  X, 
  HelpCircle, 
  Check, 
  ArrowRight,
  Settings,
  AlertCircle,
  Search,
  PackagePlus,
  CheckCircle2,
  AlertTriangle,
  XCircle
} from 'lucide-react';
import ProductPagination from '../shared/ProductPagination';
import SearchFilter from '../shared/SearchFilter';
import ExpandableText from '../shared/ExpandableText';

export default function StockPage({
  role,
  shopId,
  forms = {},
  setForms,
  data = {},
  ownerInventoryQuantity,
  myInventoryQuantity,
  updateStock,
  setTransferDrawerOpen,
  stockFilters,
  setStockFilters,
  stockPager,
  pageLoading,
  setStockPager,
  onStockPageSizeChange,
  setSelectedProductDetails,
  productName,
  fullModelList,
  priceLabel,
  onSubmitProduct,
  onEditProduct,
  onDeleteProduct,
  onAddReferenceOption,
  onEditReferenceOption,
  onDeleteReferenceOption,
  editingProductId,
  setEditingProductId,
  saving,
  setSaving,
  initialForms,
  exportCsv,
  onPrintStock,
  stockWithOwnership,
  FormPanel,
  Input,
  Select,
  Empty,
}) {
  // Collapsible sections toggle states
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isReferenceOpen, setIsReferenceOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isCustomPartCategory, setIsCustomPartCategory] = useState(false);
  const [isCustomQualityVariant, setIsCustomQualityVariant] = useState(false);
  const [isCustomNameEdited, setIsCustomNameEdited] = useState(false);

  const defaultPartCategories = ['Display', 'Battery', 'Camera', 'Speaker', 'Charging IC', 'Main Flex', 'Frame', 'Charging Port', 'Vibrator', 'Ear Speaker', 'Back Glass', 'Middle Frame', 'Sim Tray', 'Housing', 'Mic'];
  const refPartCategories = (data.reference?.partCategories || []).map(pc => typeof pc === 'string' ? pc : pc.name).filter(Boolean);
  const uniquePartCategories = Array.from(new Set([...defaultPartCategories, ...refPartCategories]));

  const defaultQualityVariants = ['OLED', 'Soft OLED', 'Hard OLED', 'Incell', 'With Frame', 'Without Frame', 'Fresh New', 'Set Remove', 'Original', 'Refurbished', 'Copy', 'Premium Copy'];
  const refQualityVariants = (data.reference?.productVariants || []).map(qv => typeof qv === 'string' ? qv : qv.name).filter(Boolean);
  const uniqueQualityVariants = Array.from(new Set([...defaultQualityVariants, ...refQualityVariants]));

  // Model Picker Modal state for quick stock addition from existing models
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [modelPickerSearch, setModelPickerSearch] = useState('');

  // Reference Manager state
  const [refTab, setRefTab] = useState('colours'); // 'colours', 'brands', 'categories'
  const [newColorInput, setNewColorInput] = useState('');
  const [newBrandInput, setNewBrandInput] = useState('');
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [editingRef, setEditingRef] = useState(null); // { type, id, name }
  const [editingRefName, setEditingRefName] = useState('');
  const stockSummaryTotals = data?.stockSummary?.totals || {};
  const stockModelTotal = Number(stockSummaryTotals.products || 0);

  // Inline color adder & category creator for product creation form
  const [inlineColorInput, setInlineColorInput] = useState('');
  const [showAddCategoryInput, setShowAddCategoryInput] = useState(false);
  const [inlineCategoryInput, setInlineCategoryInput] = useState('');

  const handleAddInlineCategory = async () => {
    const clean = inlineCategoryInput.trim();
    if (!clean) return;
    if (onAddReferenceOption) {
      await onAddReferenceOption('categories', clean);
    }
    setInlineCategoryInput('');
    setShowAddCategoryInput(false);
  };

  // Automatically expand product panel when editing a product
  useEffect(() => {
    if (editingProductId) {
      setIsAddProductOpen(true);
      setIsCustomNameEdited(true);
    } else if (!forms.product?.short_name) {
      setIsCustomNameEdited(false);
    }
  }, [editingProductId, forms.product?.short_name]);

  // Brand alias detection mapping
  const detectBrand = (name) => {
    const lower = String(name || '').toLowerCase();
    if (/1\+|one\s*plus|oneplus/.test(lower)) return 'OnePlus';
    if (/iphone|ipad|apple|i\s*phone/.test(lower)) return 'Apple';
    if (/redmi/.test(lower)) return 'Redmi';
    if (/xiaomi|\bmi\b|\bmi\d|\bmi\s/.test(lower)) return 'Xiaomi';
    if (/pixel|google/.test(lower)) return 'Google Pixel';
    if (/poco/.test(lower)) return 'Poco';
    if (/samsung|galaxy|\bsam\b/.test(lower)) return 'Samsung';
    if (/vivo/.test(lower)) return 'Vivo';
    if (/oppo/.test(lower)) return 'Oppo';
    if (/realme/.test(lower)) return 'Realme';
    if (/nothing/.test(lower)) return 'Nothing';
    if (/motorola|moto/.test(lower)) return 'Motorola';
    if (/huawei/.test(lower)) return 'Huawei';
    if (/honor/.test(lower)) return 'Honor';
    if (/nokia/.test(lower)) return 'Nokia';
    if (/infinix/.test(lower)) return 'Infinix';
    if (/tecno/.test(lower)) return 'Tecno';
    if (/lava/.test(lower)) return 'Lava';
    if (/micromax/.test(lower)) return 'Micromax';
    if (/iqoo/.test(lower)) return 'IQOO';
    if (/asus/.test(lower)) return 'Asus';
    if (/sony/.test(lower)) return 'Sony';
    if (/lenovo/.test(lower)) return 'Lenovo';
    return '';
  };

  // Run brand detection on name changes and auto-apply if not manually overridden
  const handleProductNameChange = (value, field) => {
    if (field === 'short_name') {
      setIsCustomNameEdited(Boolean(value && value.trim()));
    }
    setForms((prev) => {
      const updatedProduct = { ...prev.product, [field]: value };
      if (!updatedProduct.model) {
        updatedProduct.model = updatedProduct.short_name || (updatedProduct.full_model_list ? updatedProduct.full_model_list.split('/')[0].trim() : '');
      }
      
      // Auto detect brand based on title/compatible models
      const detected = detectBrand(updatedProduct.short_name || updatedProduct.full_model_list);
      if (detected) {
        // Look up casing match from brand references
        const match = data.reference.brands.find(b => b.name.toLowerCase() === detected.toLowerCase());
        if (match) {
          updatedProduct.brand = match.name;
        }
      }
      return { ...prev, product: updatedProduct };
    });
  };

  // Toggle color array selection in product form
  const handleToggleColour = (colourName) => {
    const selected = forms.product.colours.split(',').map((c) => c.trim()).filter(Boolean);
    let next;
    if (selected.includes(colourName)) {
      next = selected.filter((c) => c !== colourName);
    } else {
      next = [...selected, colourName];
    }
    setForms((prev) => ({
      ...prev,
      product: { ...prev.product, colours: next.join(', ') }
    }));
  };

  // Inline colour tag submit handler
  const handleAddInlineColour = async (e) => {
    e.preventDefault();
    const clean = inlineColorInput.trim();
    if (!clean) return;
    await onAddReferenceOption('colours', clean);
    setInlineColorInput('');
  };

  // Reference Manager tab helper lists
  const getReferenceList = () => {
    if (refTab === 'colours') return data.reference.colours;
    if (refTab === 'brands') return data.reference.brands;
    return data.reference.categories;
  };

  // Delete reference with confirmation prompt
  const handleDeleteReference = (type, item) => {
    onDeleteReferenceOption(type, item.id);
  };

  // Delete product with confirmation
  const handleDeleteProductConfirm = (product) => {
    onDeleteProduct(product);
  };

  // Extract selected product colours list
  const getSelectedProductColours = () => {
    const prodId = forms.stock.product_id;
    if (!prodId) return [];
    const prod = data.products.find(p => String(p.id) === String(prodId));
    if (!prod) return [];
    return Array.isArray(prod.colours) ? prod.colours : String(prod.colours || '').split(',').map(c => c.trim()).filter(Boolean);
  };

  const selectedProductColours = getSelectedProductColours();
  const selectedProductDetails = data.products.find(p => String(p.id) === String(forms.stock.product_id));
  const selectedLocation = data.shops.find((location) => String(location.id) === String(shopId));
  const isWarehouseScope = role === 'superadmin' && selectedLocation?.location_type === 'warehouse';
  const stockFormTitle = role === 'shopkeeper'
    ? 'Set My Stock Quantity'
    : isWarehouseScope
      ? 'Set Warehouse Stock Quantity'
      : 'Set Branch Stock Quantity';
  const ownerQuantityLabel = isWarehouseScope
    ? 'Warehouse'
    : role === 'shopkeeper'
      ? 'Branch stock'
      : 'Owner stock';
  const assignedQuantityLabel = role === 'shopkeeper' ? 'My assigned stock' : 'Assigned stock';

  // Determine current stock item metrics for selected product
  const getStockMetricPreview = () => {
    if (!forms.stock.product_id) return null;
    const matches = stockWithOwnership.filter(item => String(item.product_id) === String(forms.stock.product_id));
    if (!matches.length) return { quantity: 0, owner_quantity: 0, my_quantity: 0, shopkeeper_quantity: 0 };
    return matches.reduce((total, item) => ({
      quantity: total.quantity + Number(item.quantity || 0),
      owner_quantity: total.owner_quantity + Number(item.owner_quantity || 0),
      my_quantity: total.my_quantity + Number(item.my_quantity || 0),
      shopkeeper_quantity: total.shopkeeper_quantity + Number(item.shopkeeper_quantity || 0),
    }), { quantity: 0, owner_quantity: 0, my_quantity: 0, shopkeeper_quantity: 0 });
  };
  const stockPreview = getStockMetricPreview();

  // Filtered products list for model picker modal
  const filteredModelPickerProducts = useMemo(() => {
    const list = data.products || [];
    if (!modelPickerSearch.trim()) return list;
    const term = modelPickerSearch.toLowerCase().trim();
    return list.filter((p) => {
      const nameMatch = String(p.short_name || p.name || '').toLowerCase().includes(term);
      const brandMatch = String(p.brand || '').toLowerCase().includes(term);
      const catMatch = String(p.category || '').toLowerCase().includes(term);
      const modelMatch = String(p.full_model_list || p.model || '').toLowerCase().includes(term);
      return nameMatch || brandMatch || catMatch || modelMatch;
    });
  }, [data.products, modelPickerSearch]);

  return (
    <section className="space">
      
      {/* Workspace Header */}
      <section className="stock-workspace-intro" style={{ marginBottom: '24px' }}>
        <div className="stock-workspace-copy">
          <span className="stock-eyebrow">Inventory Workspace</span>
          <h2>
            {role === 'shopkeeper' 
              ? 'Manage Shop Stock' 
              : 'Consolidated Stock Workspace'}
          </h2>
          <p>
            {role === 'shopkeeper'
              ? 'Update quantities for your assigned shop. Other branch stock stays hidden from branch logins.'
              : 'Add products, manage system catalogs, update stock levels, and monitor branch availability.'}
          </p>
        </div>
      </section>

      {/* Shopkeeper Stock Summary */}
      {role === 'shopkeeper' && (
        <section className="inventory-ownership-summary compact-summary" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
          <article className="ownership-summary-card owner" style={{ padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
            <span style={{ fontSize: '12px', opacity: 0.6 }}>Branch Shared Stock</span>
            <strong style={{ fontSize: '24px', display: 'block', margin: '4px 0' }}>{ownerInventoryQuantity} pcs</strong>
            <small style={{ fontSize: '11px', opacity: 0.5 }}>Unassigned stock in your shop</small>
          </article>
          <article className="ownership-summary-card mine" style={{ padding: '16px', borderRadius: '16px', border: '1px solid rgba(25,160,140,0.2)', background: 'rgba(25,160,140,0.05)' }}>
            <span style={{ fontSize: '12px', opacity: 0.6, color: '#14b8a6' }}>My Assigned Stock</span>
            <strong style={{ fontSize: '24px', display: 'block', margin: '4px 0', color: '#14b8a6' }}>{myInventoryQuantity} pcs</strong>
            <small style={{ fontSize: '11px', opacity: 0.5 }}>Stock assigned to your login</small>
          </article>
        </section>
      )}

      {/* Grid of Main Actions: Set Stock Form & Branch Transfer info */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px', marginBottom: '24px' }}>
        
        {/* Set/Add Stock Level Card */}
        <FormPanel 
          title={stockFormTitle}
          action="Save Quantity" 
          onSubmit={updateStock}
          disabled={saving || !forms.stock.product_id || forms.stock.quantity === ''}
        >
          <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div style={{ flex: 1, minWidth: '260px' }}>
              <Select 
                label="Select Product to Update" 
                value={forms.stock.product_id} 
                onChange={(v) => {
                  setForms((prev) => ({
                    ...prev,
                    stock: { 
                      ...prev.stock, 
                      product_id: v, 
                      colour: '', // Reset colour when product changes
                      quantity: '' // Clear input
                    }
                  }));
                }} 
                options={data.products.map((p) => [p.id, `${productName(p)} · [${p.brand}] · ${priceLabel(p.sale_price)}`])} 
              />
            </div>
            <button
              type="button"
              onClick={() => setIsModelPickerOpen(true)}
              style={{
                padding: '10px 16px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #0d9488 0%, #0284c7 100%)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '12px',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)'
              }}
            >
              <PackagePlus size={15} /> Pick from Models Catalog
            </button>
          </div>

            {/* Current Stock Preview & Optional Colour dropdown */}
            {forms.stock.product_id && (
              <div style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <span style={{ fontSize: '12px', opacity: 0.6, display: 'block' }}>Current Stock Metrics:</span>
                    <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
                      <span style={{ fontSize: '13px' }}>Total Available: <b style={{ color: '#14b8a6' }}>{stockPreview?.quantity || 0} pcs</b></span>
                    <span style={{ fontSize: '13px', opacity: 0.8 }}>{ownerQuantityLabel}: <b>{stockPreview?.owner_quantity || 0}</b></span>
                    <span style={{ fontSize: '13px', opacity: 0.8 }}>{assignedQuantityLabel}: <b>{role === 'shopkeeper' ? stockPreview?.my_quantity || 0 : stockPreview?.shopkeeper_quantity || 0}</b></span>
                  </div>
                </div>

                {selectedProductColours.length > 0 ? (
                  <div style={{ minWidth: '180px' }}>
                    <Select
                      label="Colour (Optional)"
                      value={forms.stock.colour}
                      onChange={(v) => setForms((prev) => ({ ...prev, stock: { ...prev.stock, colour: v } }))}
                      options={[['', 'Generic / No Colour'], ...selectedProductColours.map(c => [c, c])]}
                    />
                  </div>
                ) : (
                  <span style={{ fontSize: '12px', opacity: 0.5 }}>No colours registered for this product.</span>
                )}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Input 
                label={role === 'shopkeeper' ? 'New Branch Quantity' : 'New Stock Quantity'} 
                type="number" 
                placeholder="Example: 15"
                value={forms.stock.quantity} 
                onChange={(v) => setForms((prev) => ({ ...prev, stock: { ...prev.stock, quantity: v } }))} 
              />
              <Select 
                label="Supplier (Optional)"
                value={forms.stock.supplier_id || ''}
                onChange={(v) => setForms((prev) => ({ ...prev, stock: { ...prev.stock, supplier_id: v } }))}
                options={[
                  ['', 'Choose Supplier'],
                  ...(data.reference?.suppliers || [])
                    .filter(s => s.is_active)
                    .map(s => [s.id, s.name])
                ]}
              />
            </div>
          </div>
        </FormPanel>

        {/* Superadmin branch transfer shortcut */}
        {role === 'superadmin' && (
          <section className="panel transfer-launch" style={{ background: 'linear-gradient(135deg, rgba(20,184,166,0.05) 0%, rgba(99,102,241,0.05) 100%)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', borderRadius: '16px' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Branch Stock Transfer</h2>
              <p style={{ opacity: 0.7, fontSize: '13px', marginTop: '4px' }}>Move available stock between shops or from main warehouse instantly.</p>
            </div>
            <button className="primary" type="button" onClick={() => setTransferDrawerOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Send size={16} /> Transfer Stock
            </button>
          </section>
        )}

      </section>

      {/* Collapsible Unified Workspace Panels */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
        
        {/* PANEL 1: Add/Edit Product Panel */}
        <div className="panel stock-product-panel">
          <button 
            type="button" 
            onClick={() => setIsAddProductOpen(!isAddProductOpen)} 
            className="stock-product-toggle"
          >
            <div className="stock-product-toggle-main">
              <span className="stock-product-toggle-icon">
                <Smartphone size={18} />
              </span>
              <div>
                <strong>{editingProductId ? 'Edit Product & Pricing' : 'Add New Product'}</strong>
                <small>{editingProductId ? 'Modify pricing, models, and specifications' : 'Create a new catalog item with default pricing'}</small>
              </div>
            </div>
            {isAddProductOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {isAddProductOpen && (
            <div className="stock-product-body">
              <form className="stock-product-form space-y-5" onSubmit={(e) => { e.preventDefault(); onSubmitProduct(); }}>
                <div className="stock-product-flow space-y-5">
                  
                  {/* Row 1: Short Display Name & Compatible Phone Models */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input 
                      label="SHORT DISPLAY NAME (VISIBLE TO USERS)" 
                      placeholder="Example: iPhone 13 Pro Display"
                      value={forms.product.short_name} 
                      onChange={(v) => handleProductNameChange(v, 'short_name')} 
                    />
                    <Input 
                      label="COMPATIBLE PHONE MODELS (FULL LIST)" 
                      placeholder="Example: A2483, A2484, A2636"
                      value={forms.product.full_model_list} 
                      onChange={(v) => handleProductNameChange(v, 'full_model_list')} 
                    />
                  </div>                  {/* Row 2: Brand & Model */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Select 
                      label="BRAND *" 
                      placeholder="Select Brand"
                      value={forms.product.brand} 
                      onChange={(v) => {
                        const brandName = v;
                        setForms(prev => {
                          const autoName = [brandName, prev.product.model, prev.product.part_category, prev.product.quality_variant].filter(Boolean).join(' ');
                          return {
                            ...prev,
                            product: {
                              ...prev.product,
                              brand: brandName,
                              short_name: isCustomNameEdited ? prev.product.short_name : autoName,
                              full_model_list: prev.product.full_model_list || prev.product.model || autoName
                            }
                          };
                        });
                      }} 
                      options={[['', 'Select Brand'], ...data.reference.brands.map(b => [b.name, b.name])]}
                    />
                    <Input 
                      label="MODEL *" 
                      placeholder="Type Model Name (e.g. V40e, iPhone 13)"
                      value={forms.product.model} 
                      onChange={(v) => {
                        const modelName = v;
                        setForms(prev => {
                          const autoName = [prev.product.brand, modelName, prev.product.part_category, prev.product.quality_variant].filter(Boolean).join(' ');
                          return {
                            ...prev,
                            product: {
                              ...prev.product,
                              model: modelName,
                              short_name: isCustomNameEdited ? prev.product.short_name : autoName,
                              full_model_list: modelName
                            }
                          };
                        });
                      }} 
                    />
                  </div>

                  {/* Row 3: Manufacturing Brand (Optional) & Supplier */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Select 
                      label="MANUFACTURING BRAND (OPTIONAL)" 
                      placeholder="Select Manufacturing Brand"
                      value={forms.product.manufacturing_brand_id || ''} 
                      onChange={(v) => setForms(prev => ({ ...prev, product: { ...prev.product, manufacturing_brand_id: v } }))} 
                      options={[
                        ['', 'Select Manufacturing Brand'], 
                        ...(data.reference.manufacturingBrands || [])
                          .filter(mb => mb.is_active || String(mb.id) === String(forms.product.manufacturing_brand_id))
                          .map(mb => [mb.id, mb.name])
                      ]}
                    />
                    <Select 
                      label="SUPPLIER (OPTIONAL)" 
                      placeholder="Select Supplier"
                      value={forms.product.supplier_id || ''} 
                      onChange={(v) => setForms(prev => ({ ...prev, product: { ...prev.product, supplier_id: v } }))} 
                      options={[
                        ['', 'Select Supplier'], 
                        ...(data.reference.suppliers || [])
                          .filter(s => s.is_active || String(s.id) === String(forms.product.supplier_id))
                          .map(s => [s.id, s.name])
                      ]}
                    />
                  </div>

                  {/* Separate Part Category & Quality / Variant Container */}
                  <div className="border border-emerald-300 dark:border-teal-800/80 rounded-2xl p-4 bg-emerald-50/20 dark:bg-emerald-950/10 grid grid-cols-1 md:grid-cols-2 gap-5">
                    
                    {/* Field 1: Part Category */}
                    <div className="flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider block">PART CATEGORY *</span>
                          <button
                            type="button"
                            onClick={() => {
                              const nextState = !isCustomPartCategory;
                              setIsCustomPartCategory(nextState);
                              if (nextState) {
                                setForms(prev => ({ ...prev, product: { ...prev.product, part_category: '' } }));
                              }
                            }}
                            className="text-[11px] font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 cursor-pointer"
                          >
                            <Plus size={12} /> {isCustomPartCategory ? 'Select Part Category' : 'Add New Part Category'}
                          </button>
                        </div>

                        {isCustomPartCategory ? (
                          <Input 
                            label="New Part Category" 
                            placeholder="Type part category (e.g. Display, Battery, Camera)"
                            value={forms.product.part_category || ''} 
                            onChange={(v) => {
                              const partCat = v;
                              setForms(prev => {
                                const autoName = [prev.product.brand, prev.product.model, partCat, prev.product.quality_variant].filter(Boolean).join(' ');
                                return {
                                  ...prev,
                                  product: {
                                    ...prev.product,
                                    part_category: partCat,
                                    short_name: isCustomNameEdited ? prev.product.short_name : autoName
                                  }
                                };
                              });
                            }} 
                          />
                        ) : (
                          <Select 
                            label="Part Category *" 
                            placeholder="Select Part Category"
                            value={forms.product.part_category || ''} 
                            onChange={(v) => {
                              if (v === '__ADD_NEW__') {
                                setIsCustomPartCategory(true);
                                setForms(prev => ({ ...prev, product: { ...prev.product, part_category: '' } }));
                              } else {
                                const partCat = v;
                                setForms(prev => {
                                  const autoName = [prev.product.brand, prev.product.model, partCat, prev.product.quality_variant].filter(Boolean).join(' ');
                                  return {
                                    ...prev,
                                    product: {
                                      ...prev.product,
                                      part_category: partCat,
                                      short_name: isCustomNameEdited ? prev.product.short_name : autoName
                                    }
                                  };
                                });
                              }
                            }} 
                            options={[
                              ...uniquePartCategories.map(pc => [pc, pc]),
                              ['__ADD_NEW__', '➕ Add New Part Category...']
                            ]}
                          />
                        )}

                        {/* Quick Type Chips */}
                        <div className="mt-2.5 flex flex-wrap items-center gap-1 text-xs">
                          <span className="text-[10px] font-bold text-slate-400 mr-1">Quick Categories:</span>
                          {['Display', 'Battery', 'Camera', 'Speaker', 'Charging Port', 'Back Glass', 'Frame'].map((chip) => (
                            <button
                              type="button"
                              key={chip}
                              onClick={() => {
                                setIsCustomPartCategory(false);
                                const partCat = chip;
                                setForms(prev => {
                                  const autoName = [prev.product.brand, prev.product.model, partCat, prev.product.quality_variant].filter(Boolean).join(' ');
                                  return {
                                    ...prev,
                                    product: {
                                      ...prev.product,
                                      part_category: partCat,
                                      short_name: isCustomNameEdited ? prev.product.short_name : autoName
                                    }
                                  };
                                });
                              }}
                              className={`px-2 py-0.5 rounded-md border text-[10px] font-bold transition-all cursor-pointer ${
                                forms.product.part_category === chip 
                                  ? 'bg-teal-600 text-white border-teal-700 shadow-xs'
                                  : 'bg-white text-slate-600 border-slate-200 hover:border-teal-500'
                              }`}
                            >
                              {chip}
                            </button>
                          ))}
                        </div>
                      </div>

                      <p className="text-[10px] text-slate-500 font-semibold italic">Defines WHAT spare part this is (Display, Battery, Camera, etc.)</p>
                    </div>

                    {/* Field 2: Product Quality / Variant */}
                    <div className="flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider block">QUALITY / VARIANT (OPTIONAL)</span>
                          <button
                            type="button"
                            onClick={() => {
                              const nextState = !isCustomQualityVariant;
                              setIsCustomQualityVariant(nextState);
                              if (nextState) {
                                setForms(prev => ({ ...prev, product: { ...prev.product, quality_variant: '' } }));
                              }
                            }}
                            className="text-[11px] font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 cursor-pointer"
                          >
                            <Plus size={12} /> {isCustomQualityVariant ? 'Select Variant' : 'Add New Variant'}
                          </button>
                        </div>

                        {isCustomQualityVariant ? (
                          <Input 
                            label="New Quality / Variant" 
                            placeholder="Type variant (e.g. OLED, Incell, With Frame)"
                            value={forms.product.quality_variant || ''} 
                            onChange={(v) => {
                              const qualVar = v;
                              setForms(prev => {
                                const autoName = [prev.product.brand, prev.product.model, prev.product.part_category, qualVar].filter(Boolean).join(' ');
                                return {
                                  ...prev,
                                  product: {
                                    ...prev.product,
                                    quality_variant: qualVar,
                                    short_name: isCustomNameEdited ? prev.product.short_name : autoName
                                  }
                                };
                              });
                            }} 
                          />
                        ) : (
                          <Select 
                            label="Quality / Variant (Optional)" 
                            placeholder="Select Variant"
                            value={forms.product.quality_variant || ''} 
                            onChange={(v) => {
                              if (v === '__ADD_NEW__') {
                                setIsCustomQualityVariant(true);
                                setForms(prev => ({ ...prev, product: { ...prev.product, quality_variant: '' } }));
                              } else {
                                const qualVar = v;
                                setForms(prev => {
                                  const autoName = [prev.product.brand, prev.product.model, prev.product.part_category, qualVar].filter(Boolean).join(' ');
                                  return {
                                    ...prev,
                                    product: {
                                      ...prev.product,
                                      quality_variant: qualVar,
                                      short_name: isCustomNameEdited ? prev.product.short_name : autoName
                                    }
                                  };
                                });
                              }
                            }} 
                            options={[
                              ['', '(None / Default)'],
                              ...uniqueQualityVariants.map(qv => [qv, qv]),
                              ['__ADD_NEW__', '➕ Add New Quality Variant...']
                            ]}
                          />
                        )}

                        {/* Quick Variant Chips */}
                        <div className="mt-2.5 flex flex-wrap items-center gap-1 text-xs">
                          <span className="text-[10px] font-bold text-slate-400 mr-1">Quick Variants:</span>
                          {['OLED', 'Incell', 'With Frame', 'Without Frame', 'Fresh New', 'Set Remove', 'Original'].map((chip) => (
                            <button
                              type="button"
                              key={chip}
                              onClick={() => {
                                setIsCustomQualityVariant(false);
                                const qualVar = chip;
                                setForms(prev => {
                                  const autoName = [prev.product.brand, prev.product.model, prev.product.part_category, qualVar].filter(Boolean).join(' ');
                                  return {
                                    ...prev,
                                    product: {
                                      ...prev.product,
                                      quality_variant: qualVar,
                                      short_name: isCustomNameEdited ? prev.product.short_name : autoName
                                    }
                                  };
                                });
                              }}
                              className={`px-2 py-0.5 rounded-md border text-[10px] font-bold transition-all cursor-pointer ${
                                forms.product.quality_variant === chip 
                                  ? 'bg-teal-600 text-white border-teal-700 shadow-xs'
                                  : 'bg-white text-slate-600 border-slate-200 hover:border-teal-500'
                              }`}
                            >
                              {chip}
                            </button>
                          ))}
                        </div>
                      </div>

                      <p className="text-[10px] text-slate-500 font-semibold italic">Defines WHICH VERSION/QUALITY it is (OLED, Incell, With Frame, etc.)</p>
                    </div>

                  </div>

                  {/* Pricing Row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Input 
                      label="SELLING PRICE (RETAIL)" 
                      type="number" 
                      placeholder="₹ 0.00"
                      value={forms.product.sale_price} 
                      onChange={(v) => setForms(prev => ({ ...prev, product: { ...prev.product, sale_price: v } }))} 
                    />
                    <Input 
                      label="WHOLESALE PRICE (OPTIONAL)" 
                      type="number" 
                      placeholder="₹ 0.00"
                      value={forms.product.wholesale_price} 
                      onChange={(v) => setForms(prev => ({ ...prev, product: { ...prev.product, wholesale_price: v } }))} 
                    />
                    <Input 
                      label="PURCHASE PRICE (COST)" 
                      type="number" 
                      placeholder="₹ 0.00"
                      value={forms.product.purchase_price} 
                      onChange={(v) => setForms(prev => ({ ...prev, product: { ...prev.product, purchase_price: v } }))} 
                    />
                  </div>

                  {/* Description / Compatibility Notes */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">DESCRIPTION / COMPATIBILITY NOTES</label>
                    <textarea 
                      rows={3}
                      className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 outline-none focus:border-teal-500 focus:bg-white transition-all resize-none"
                      placeholder="Add product description, compatibility info, quality notes etc..."
                      value={forms.product.description}
                      onChange={(e) => setForms(prev => ({ ...prev, product: { ...prev.product, description: e.target.value } }))}
                    />
                  </div>

                  {/* Initial Available Stock & Stock Status */}
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-6">
                      {!editingProductId && (
                        <div style={{ width: '180px' }}>
                          <Input 
                            label="INITIAL AVAILABLE STOCK ⓘ" 
                            type="number" 
                            placeholder="0"
                            value={forms.product.opening_stock} 
                            onChange={(v) => setForms(prev => ({ ...prev, product: { ...prev.product, opening_stock: v } }))} 
                          />
                        </div>
                      )}

                      <div className="space-y-1">
                        <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">STOCK STATUS ⓘ</span>
                        <div className="flex items-center gap-2">
                          <span className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
                            Number(forms.product.opening_stock || 0) > 5 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300' 
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}>
                            <CheckCircle2 size={14} className="text-emerald-600" /> In Stock
                          </span>
                          <span className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
                            Number(forms.product.opening_stock || 0) > 0 && Number(forms.product.opening_stock || 0) <= 5
                              ? 'bg-amber-50 text-amber-700 border-amber-300' 
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}>
                            <AlertTriangle size={14} className="text-amber-600" /> Low Stock
                          </span>
                          <span className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
                            Number(forms.product.opening_stock || 0) === 0
                              ? 'bg-rose-50 text-rose-700 border-rose-300' 
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}>
                            <XCircle size={14} className="text-rose-600" /> No Stock
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end">
                      <button
                        type="button"
                        onClick={() => setIsAddProductOpen(false)}
                        className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-teal-600/20 active:scale-95 transition-all cursor-pointer"
                      >
                        <PackagePlus size={16} /> {saving ? 'Saving Product...' : editingProductId ? 'Update Product' : 'Save Product'}
                      </button>
                    </div>
                  </div>

                  {/* Product Colours Tagging */}
                  <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2.5">
                    <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">Product Colours Tagging</span>
                    <p className="text-[11px] text-slate-500 font-semibold">Select all colours that apply to this product. Typo-free tags keep inventory consistent.</p>
                    
                    <div className="flex flex-wrap gap-2">
                      {data.reference.colours.map((col) => {
                        const isSelected = forms.product.colours.split(',').map(c => c.trim()).includes(col.name);
                        return (
                          <button
                            type="button"
                            key={col.id}
                            onClick={() => handleToggleColour(col.name)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer ${
                              isSelected
                                ? 'bg-teal-600 text-white border-teal-700 shadow-xs'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {isSelected && <Check size={12} />}
                            {col.name}
                          </button>
                        );
                      })}
                    </div>

                    {/* Inline Quick Add Colour */}
                    <div className="pt-2 flex items-center gap-2 max-w-xs">
                      <input 
                        className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-teal-500"
                        type="text"
                        placeholder="Type new colour..."
                        value={inlineColorInput}
                        onChange={(e) => setInlineColorInput(e.target.value)}
                      />
                      <button 
                        className="px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
                        type="button" 
                        onClick={handleAddInlineColour}
                        disabled={saving}
                      >
                        <Plus size={12} /> Add
                      </button>
                    </div>
                  </div>

                </div>
              </form>
            </div>
          )}
        </div>

        {/* PANEL 2: Collapsible Reference Manager */}
        <div className="panel" style={{ border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden', padding: 0 }}>
          <button 
            type="button" 
            onClick={() => setIsReferenceOpen(!isReferenceOpen)} 
            style={{ width: '100%', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ padding: '8px', borderRadius: '8px', background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}>
                <Settings size={18} />
              </span>
              <div>
                <strong style={{ fontSize: '15px', display: 'block' }}>Reference Manager</strong>
                <small style={{ opacity: 0.6, fontSize: '12px' }}>Manage list items for phone brands, categories, and colors</small>
              </div>
            </div>
            {isReferenceOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {isReferenceOpen && (
            <div style={{ padding: '20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              
              {/* Tab Selector */}
              <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px', marginBottom: '16px', overflowX: 'auto' }}>
                <button 
                  type="button" 
                  onClick={() => { setRefTab('partCategories'); setEditingRef(null); }}
                  style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '13px', border: 'none', cursor: 'pointer', background: refTab === 'partCategories' ? 'rgba(13,148,136,0.15)' : 'transparent', color: refTab === 'partCategories' ? '#0d9488' : 'rgba(255,255,255,0.6)', fontWeight: '700' }}
                >
                  Part Categories
                </button>
                <button 
                  type="button" 
                  onClick={() => { setRefTab('productVariants'); setEditingRef(null); }}
                  style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '13px', border: 'none', cursor: 'pointer', background: refTab === 'productVariants' ? 'rgba(13,148,136,0.15)' : 'transparent', color: refTab === 'productVariants' ? '#0d9488' : 'rgba(255,255,255,0.6)', fontWeight: '700' }}
                >
                  Quality / Variants
                </button>
                <button 
                  type="button" 
                  onClick={() => { setRefTab('brands'); setEditingRef(null); }}
                  style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '13px', border: 'none', cursor: 'pointer', background: refTab === 'brands' ? 'rgba(13,148,136,0.15)' : 'transparent', color: refTab === 'brands' ? '#0d9488' : 'rgba(255,255,255,0.6)', fontWeight: '700' }}
                >
                  Brands {role !== 'superadmin' && <small>(Read-Only)</small>}
                </button>
                <button 
                  type="button" 
                  onClick={() => { setRefTab('colours'); setEditingRef(null); }}
                  style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '13px', border: 'none', cursor: 'pointer', background: refTab === 'colours' ? 'rgba(13,148,136,0.15)' : 'transparent', color: refTab === 'colours' ? '#0d9488' : 'rgba(255,255,255,0.6)', fontWeight: '700' }}
                >
                  Colours
                </button>
              </div>

              {/* Creator form for selected type */}
              {(refTab === 'colours' || refTab === 'partCategories' || refTab === 'productVariants' || role === 'superadmin') ? (
                <form 
                  style={{ display: 'flex', gap: '8px', marginBottom: '16px', maxWidth: '400px' }}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (refTab === 'colours') {
                      await onAddReferenceOption('colours', newColorInput);
                      setNewColorInput('');
                    } else if (refTab === 'brands') {
                      await onAddReferenceOption('brands', newBrandInput);
                      setNewBrandInput('');
                    } else if (refTab === 'partCategories') {
                      await onAddReferenceOption('partCategories', newCategoryInput);
                      setNewCategoryInput('');
                    } else if (refTab === 'productVariants') {
                      await onAddReferenceOption('productVariants', newCategoryInput);
                      setNewCategoryInput('');
                    }
                  }}
                >
                  <input 
                    type="text" 
                    placeholder={`New ${refTab === 'partCategories' ? 'part category' : refTab === 'productVariants' ? 'variant' : refTab.slice(0, -1)} name...`}
                    value={refTab === 'colours' ? newColorInput : refTab === 'brands' ? newBrandInput : newCategoryInput}
                    onChange={(e) => {
                      if (refTab === 'colours') setNewColorInput(e.target.value);
                      else if (refTab === 'brands') setNewBrandInput(e.target.value);
                      else setNewCategoryInput(e.target.value);
                    }}
                    style={{ flex: 1, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', fontSize: '13px', color: '#fff', outline: 'none' }}
                  />
                  <button className="primary" type="submit" disabled={saving}>
                    <Plus size={14} style={{ marginRight: '4px' }} /> Add
                  </button>
                </form>
              ) : (
                <div style={{ display: 'flex', gap: '8px', padding: '10px 14px', background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.1)', borderRadius: '8px', fontSize: '12px', color: '#f87171', alignItems: 'center', marginBottom: '16px' }}>
                  <AlertCircle size={14} /> Only Super Admins can add or modify phone brands and categories.
                </div>
              )}

              {/* Items Grid list */}
              {(() => {
                const referenceList = refTab === 'partCategories' 
                  ? ((data.reference?.partCategories && data.reference.partCategories.length) ? data.reference.partCategories : uniquePartCategories.map((pc, i) => ({ id: `pc_${i}`, name: pc })))
                  : refTab === 'productVariants'
                  ? ((data.reference?.productVariants && data.reference.productVariants.length) ? data.reference.productVariants : uniqueQualityVariants.map((qv, i) => ({ id: `qv_${i}`, name: qv })))
                  : refTab === 'brands'
                  ? (data.reference?.brands || [])
                  : (data.reference?.colours || []);
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px', maxHeight: '250px', overflowY: 'auto', paddingRight: '6px' }}>
                    {referenceList.map((item) => {
                      const isEditing = editingRef && editingRef.id === item.id && editingRef.type === refTab;
                      return (
                    <div 
                      key={item.id} 
                      style={{ padding: '8px 12px', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
                          <input 
                            type="text" 
                            value={editingRefName}
                            onChange={(e) => setEditingRefName(e.target.value)}
                            style={{ flex: 1, padding: '4px 8px', background: 'rgba(255,255,255,0.06)', border: '1px solid #a855f7', borderRadius: '4px', fontSize: '12px', color: '#fff', outline: 'none' }}
                          />
                          <button 
                            type="button"
                            onClick={async () => {
                              await onEditReferenceOption(refTab, item.id, editingRefName);
                              setEditingRef(null);
                            }}
                            style={{ padding: '4px 6px', background: '#14b8a6', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}
                          >
                            <Check size={12} />
                          </button>
                          <button 
                            type="button" 
                            onClick={() => setEditingRef(null)}
                            style={{ padding: '4px 6px', background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '4px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span style={{ fontSize: '13px' }}>{item.name}</span>
                          {(refTab === 'colours' || role === 'superadmin') && (
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button 
                                type="button" 
                                title="Rename"
                                onClick={() => {
                                  setEditingRef({ type: refTab, id: item.id, name: item.name });
                                  setEditingRefName(item.name);
                                }}
                                style={{ padding: '4px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}
                              >
                                <Edit3 size={12} />
                              </button>
                              <button 
                                type="button" 
                                title="Archive"
                                onClick={() => handleDeleteReference(refTab, item)}
                                style={{ padding: '4px', background: 'transparent', border: 'none', color: '#f87171', opacity: 0.8, cursor: 'pointer' }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

            </div>
          )}
        </div>

        {/* PANEL 3: Export & PDF Tools */}
        <div className="panel" style={{ border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden', padding: 0 }}>
          <button 
            type="button" 
            onClick={() => setIsExportOpen(!isExportOpen)} 
            style={{ width: '100%', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ padding: '8px', borderRadius: '8px', background: 'rgba(20,184,166,0.1)', color: '#14b8a6' }}>
                <Download size={18} />
              </span>
              <div>
                <strong style={{ fontSize: '15px', display: 'block' }}>Export & PDF Tools</strong>
                <small style={{ opacity: 0.6, fontSize: '12px' }}>Download stock report sheets or generate printable PDF views</small>
              </div>
            </div>
            {isExportOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {isExportOpen && (
            <div style={{ padding: '20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                
                {/* Export Stock CSV */}
                <button 
                  type="button" 
                  onClick={() => exportCsv('stock', {
                    brand: stockFilters.brand,
                    category: stockFilters.category,
                    colour: stockFilters.colour,
                    status: stockFilters.status
                  })}
                  style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s ease' }}
                >
                  <span style={{ display: 'block', fontWeight: 600, fontSize: '14px', color: '#14b8a6' }}>Export Current Stock (CSV)</span>
                  <p style={{ fontSize: '11px', opacity: 0.6, marginTop: '4px' }}>Download a grouped CSV file based on your active filters and shop selection.</p>
                </button>

                {/* Export Active Products List */}
                <button 
                  type="button" 
                  onClick={() => exportCsv('products')}
                  style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s ease' }}
                >
                  <span style={{ display: 'block', fontWeight: 600, fontSize: '14px', color: '#14b8a6' }}>Export Product Catalog (CSV)</span>
                  <p style={{ fontSize: '11px', opacity: 0.6, marginTop: '4px' }}>Download list of all active products, brands, model codes, and price list.</p>
                </button>

                {/* PDF Print view */}
                <button 
                  type="button" 
                  onClick={onPrintStock}
                  style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s ease' }}
                >
                  <span style={{ display: 'flex', fontWeight: 600, fontSize: '14px', color: '#14b8a6', alignItems: 'center', gap: '6px' }}><Printer size={14} /> Print Stock Sheet</span>
                  <p style={{ fontSize: '11px', opacity: 0.6, marginTop: '4px' }}>Create a clean PDF-ready stock list with compatible device, stock price, sale price, and remaining quantity.</p>
                </button>

              </div>
            </div>
          )}
        </div>

      </section>

      {/* Daily-Use Action Bar: Search & Collapsible Filters toggle */}
      <div className="stock-section-heading" style={{ marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span className="stock-eyebrow">Live Stock</span>
          <h2>Current Stock Overview</h2>
        </div>
        {stockPager.loaded && (
          <div className="models-summary">
            <span className="status-badge stock-ok">{Number(stockPager.total || 0).toLocaleString('en-IN')} stock rows</span>
            {stockModelTotal > 0 && (
              <span className="status-badge due">{stockModelTotal.toLocaleString('en-IN')} models</span>
            )}
          </div>
        )}
        
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <SearchFilter
            placeholder="Search brand, category, model, description, colour, or notes..."
            value={stockFilters.search}
            onChange={(val) => setStockFilters(prev => ({ ...prev, search: val }))}
          />
          <button 
            className="soft" 
            type="button" 
            onClick={() => setIsFiltersOpen(!isFiltersOpen)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Filter size={16} /> Filters
            {isFiltersOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Filters Accordion Panel */}
      {isFiltersOpen && (
        <section className="panel" style={{ marginBottom: '20px', padding: '16px', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', background: 'rgba(255,255,255,0.01)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            
            {/* Category filter */}
            <Select 
              label="Category"
              value={stockFilters.category}
              onChange={(v) => setStockFilters(prev => ({ ...prev, category: v }))}
              options={[['', 'All Categories'], ...data.reference.categories.map(c => [c.name, c.name])]}
            />

            {/* Brand filter */}
            <Select 
              label="Brand"
              value={stockFilters.brand}
              onChange={(v) => setStockFilters(prev => ({ ...prev, brand: v }))}
              options={[['', 'All Brands'], ...data.reference.brands.map(b => [b.name, b.name])]}
            />

            {/* Colour filter */}
            <Select 
              label="Colour"
              value={stockFilters.colour}
              onChange={(v) => setStockFilters(prev => ({ ...prev, colour: v }))}
              options={[['', 'All Colours'], ...data.reference.colours.map(col => [col.name, col.name])]}
            />

            {/* Status filter */}
            <Select 
              label="Stock Status"
              value={stockFilters.status}
              onChange={(v) => setStockFilters(prev => ({ ...prev, status: v }))}
              options={[
                ['', 'All Stock status'],
                ['in_stock', 'In Stock (> Low Stock Threshold)'],
                ['low_stock', 'Low Stock (<= Threshold)'],
                ['out_of_stock', 'Out of Stock (Quantity = 0)'],
                ['recently_added', 'Recently Added (Newest first)']
              ]}
            />

          </div>
          
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button 
              type="button" 
              onClick={() => setStockFilters({ search: '', brand: '', category: '', colour: '', status: '', shopkeeperId: '', ownership: '' })}
              style={{ padding: '6px 12px', fontSize: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', borderRadius: '6px', cursor: 'pointer' }}
            >
              Reset Filters
            </button>
          </div>
        </section>
      )}

      {/* Stock Grid Table */}
      {stockWithOwnership.length ? (
        <div className="table panel inventory-stock-table shadow-sm border border-slate-200/80 bg-white" style={{ borderRadius: '20px', overflow: 'hidden' }}>
          {stockWithOwnership.map((item) => {
            const isLowStock = item.quantity > 0 && item.quantity <= (data.shops.find(s => s.id === item.shop_id)?.low_stock_threshold || 5);
            const isOutOfStock = Number(item.quantity) === 0;
            const isWarehouseRow = item.location_type === 'warehouse' || String(item.shop_id) === String(data.warehouse?.id);

            const hasSalePrice = item.sale_price !== null && item.sale_price !== undefined && item.sale_price !== '';
            const hasPurchasePrice = item.purchase_price !== null && item.purchase_price !== undefined && item.purchase_price !== '';

            return (
              <div 
                className="row hover:bg-slate-50/60 transition-all duration-300 border-b border-slate-100/90" 
                key={item.id} 
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '3.4fr 1.3fr 1.3fr 1.3fr 1.8fr 2.1fr 1.8fr', 
                  alignItems: 'center', 
                  padding: '16px 20px', 
                }}
              >
                
                {/* Product Name & Brand */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)', color: '#0d9488', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px -2px rgba(13,148,136,0.12)' }}>
                    <Smartphone size={18} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <b style={{ fontSize: '14.5px', color: '#1e293b', fontWeight: '800', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{productName(item)}</b>
                    {fullModelList(item) && fullModelList(item) !== productName(item) && (
                      <ExpandableText
                        className="stock-compatible-models text-slate-500 font-medium leading-relaxed"
                        text={fullModelList(item)}
                        limit={78}
                      />
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                      <span style={{ padding: '2px 8px', background: '#f8fafc', color: '#475569', borderRadius: '6px', fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', border: '1px solid #e2e8f0' }}>{item.brand || 'No brand'}</span>
                      {item.manufacturing_brand_name && (
                        <span style={{ padding: '2px 8px', background: '#f0fdf4', color: '#166534', borderRadius: '6px', fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', border: '1px solid #bbf7d0' }}>Mfg: {item.manufacturing_brand_name}</span>
                      )}
                      {item.supplier_name && (
                        <span style={{ padding: '2px 8px', background: '#eff6ff', color: '#1e40af', borderRadius: '6px', fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', border: '1px solid #bfdbfe' }}>Supplier: {item.supplier_name}</span>
                      )}
                      {!shopId && <span style={{ color: '#94a3b8', fontSize: '10.5px', fontWeight: '500' }}>· {item.shop_name}</span>}
                    </div>
                  </div>
                </div>

                {/* Category */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 border border-teal-200/50 text-[10.5px] font-extrabold uppercase tracking-wider">
                    {item.category || 'Mobile'}
                  </span>
                </div>

                {/* Specific Model Code */}
                <span style={{ fontSize: '13px', color: '#475569', fontWeight: '600' }}>
                  {item.model || <span style={{ color: '#cbd5e1', fontWeight: '400' }}>—</span>}
                </span>

                {/* Colours Tagged */}
                <span style={{ fontSize: '12px' }}>
                  {Array.isArray(item.colours) && item.colours.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {item.colours.map((col, idx) => (
                        <span key={idx} style={{ padding: '2px 6px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '9px', fontWeight: '700', color: '#64748b' }}>{col}</span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: '#94a3b8', fontSize: '11px', fontStyle: 'italic' }}>No colours</span>
                  )}
                </span>

                {/* Price (Sale / Purchase Cost) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {hasSalePrice ? (
                    <strong style={{ fontSize: '14px', color: '#0f766e', fontWeight: '800' }}>{priceLabel(item.sale_price)}</strong>
                  ) : (
                    <span style={{ fontSize: '9.5px', color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '2px 6px', borderRadius: '4px', alignSelf: 'flex-start', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>No Price</span>
                  )}
                  {role === 'superadmin' && (
                    hasPurchasePrice ? (
                      <small style={{ fontSize: '10px', color: '#64748b', fontWeight: '500' }}>Cost: <span style={{ color: '#334155', fontWeight: '700' }}>{priceLabel(item.purchase_price)}</span></small>
                    ) : (
                      <small style={{ fontSize: '9px', color: '#94a3b8', fontStyle: 'italic' }}>Cost not set</small>
                    )
                  )}
                </div>

                {/* Stock Level with Warehousing breakdown */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {isOutOfStock ? (
                      <span style={{ padding: '3px 8px', background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '11px', fontWeight: '800' }}>No Stock</span>
                    ) : isLowStock ? (
                      <span style={{ padding: '3px 8px', background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', color: '#d97706', border: '1px solid #fde68a', borderRadius: '8px', fontSize: '11px', fontWeight: '800' }}>Low Stock ({item.quantity})</span>
                    ) : (
                      <span style={{ padding: '3px 8px', background: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)', color: '#0d9488', border: '1px solid #99f6e4', borderRadius: '8px', fontSize: '11px', fontWeight: '800', boxShadow: '0 2px 4px rgba(13,148,136,0.04)' }}>
                        {item.quantity} pcs
                      </span>
                    )}
                  </div>
                  <small style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', fontWeight: '500' }}>
                    {isWarehouseRow ? 'Warehouse' : role === 'shopkeeper' ? 'Branch stock' : 'Owner'}: <b style={{ color: '#334155' }}>{item.owner_quantity}</b> · {role === 'shopkeeper' ? 'My assigned' : 'Assigned'}: <b style={{ color: '#334155' }}>{role === 'shopkeeper' ? item.my_quantity : item.shopkeeper_quantity}</b>
                  </small>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <button 
                    type="button" 
                    title="Set Stock Level"
                    onClick={() => {
                      setForms((prev) => ({
                        ...prev,
                        stock: { 
                          product_id: String(item.product_id), 
                          quantity: '',
                          colour: '' 
                        }
                      }));
                      window.scrollTo({ top: 120, behavior: 'smooth' });
                    }}
                    className="hover:scale-[1.02] active:scale-[0.98] transition-all"
                    style={{ padding: '6px 12px', fontSize: '11px', background: 'linear-gradient(to right, #0d9488, #0f766e)', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: '#ffffff', fontWeight: '800', boxShadow: '0 2px 6px rgba(13,148,136,0.15)' }}
                  >
                    Set Stock
                  </button>
                  <button 
                    type="button" 
                    title={role === 'superadmin' ? 'Edit product price' : 'Edit product details'}
                    onClick={() => onEditProduct(item)}
                    className="hover:bg-slate-100 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    style={{ padding: role === 'superadmin' ? '6px 12px' : '6px 8px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', color: '#475569', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '800' }}
                  >
                    <Edit3 size={12} />
                    {role === 'superadmin' && 'Edit Price'}
                  </button>
                  {role === 'superadmin' && (
                    <button 
                      type="button" 
                      title="Delete / Archive Product"
                      onClick={() => handleDeleteProductConfirm(item)}
                      className="hover:bg-rose-50 hover:scale-[1.02] active:scale-[0.98] transition-all"
                      style={{ padding: '6px 8px', background: '#fff1f2', border: '1px solid #fecaca', borderRadius: '8px', cursor: 'pointer', color: '#e11d48' }}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      ) : (
        <Empty title="No stock matching your criteria found" />
      )}

      {/* Pagination component */}
      <ProductPagination 
        meta={stockPager} 
        loading={pageLoading.stock} 
        onPageChange={(page) => setStockPager((prev) => ({ ...prev, page }))} 
        onPageSizeChange={onStockPageSizeChange}
        totalLabel="stock rows"
      />

      {/* Model Catalog Picker Modal for Stock Addition */}
      {isModelPickerOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(8px)' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '640px', maxHeight: '85vh', background: '#ffffff', border: '1px solid rgba(226, 232, 240, 0.8)', borderRadius: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ padding: '10px', borderRadius: '14px', background: 'rgba(13, 148, 136, 0.1)', color: '#0d9488' }}>
                  <PackagePlus size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Pick Model from Catalog</h3>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0' }}>Select any existing catalog model to update or add new branch stock.</p>
                </div>
              </div>
              <button type="button" onClick={() => setIsModelPickerOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', padding: '6px', borderRadius: '8px' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '16px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
              <SearchFilter
                placeholder="Search catalog models by name, brand, category, or code..."
                value={modelPickerSearch}
                onChange={(val) => setModelPickerSearch(val)}
              />
            </div>

            <div style={{ padding: '16px', overflowY: 'auto', flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
              {filteredModelPickerProducts.map((prod) => (
                <button
                  key={prod.id}
                  type="button"
                  onClick={() => {
                    setForms((prev) => ({
                      ...prev,
                      stock: {
                        ...prev.stock,
                        product_id: String(prod.id),
                        colour: '',
                        quantity: ''
                      }
                    }));
                    setIsModelPickerOpen(false);
                    window.scrollTo({ top: 120, behavior: 'smooth' });
                  }}
                  style={{
                    padding: '14px',
                    borderRadius: '16px',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    justify: 'space-between',
                    gap: '10px'
                  }}
                  className="model-picker-item"
                >
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', display: 'block', lineHeight: 1.3 }}>{productName(prod)}</span>
                    <small style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', display: 'block' }}>{prod.brand || 'Generic'} · {prod.category || 'General'}</small>
                    {fullModelList(prod) && fullModelList(prod) !== productName(prod) && (
                      <span style={{ fontSize: '10px', color: '#0369a1', background: '#e0f2fe', padding: '2px 6px', borderRadius: '4px', marginTop: '6px', display: 'inline-block', fontWeight: 600 }}>
                        {fullModelList(prod)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#059669' }}>{priceLabel(prod.sale_price)}</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#0d9488', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      Select <ArrowRight size={12} />
                    </span>
                  </div>
                </button>
              ))}
              {!filteredModelPickerProducts.length && (
                <div style={{ gridColumn: '1 / -1', padding: '32px', textAlign: 'center', color: '#64748b', fontSize: '13px', fontWeight: 600 }}>
                  No catalog models match "{modelPickerSearch}"
                </div>
              )}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setIsModelPickerOpen(false)} style={{ padding: '8px 18px', borderRadius: '10px', background: '#e2e8f0', border: 'none', color: '#334155', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}
