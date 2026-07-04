import React, { useState, useEffect } from 'react';
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
  AlertCircle
} from 'lucide-react';
import ProductPagination from '../shared/ProductPagination';
import SearchFilter from '../shared/SearchFilter';
import ExpandableText from '../shared/ExpandableText';

export default function StockPage({
  role,
  shopId,
  forms,
  setForms,
  data,
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

  // Reference Manager state
  const [refTab, setRefTab] = useState('colours'); // 'colours', 'brands', 'categories'
  const [newColorInput, setNewColorInput] = useState('');
  const [newBrandInput, setNewBrandInput] = useState('');
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [editingRef, setEditingRef] = useState(null); // { type, id, name }
  const [editingRefName, setEditingRefName] = useState('');
  const stockSummaryTotals = data.stockSummary?.totals || {};
  const stockModelTotal = Number(stockSummaryTotals.products || 0);

  // Inline color adder for product creation form
  const [inlineColorInput, setInlineColorInput] = useState('');

  // Automatically expand product panel when editing a product
  useEffect(() => {
    if (editingProductId) {
      setIsAddProductOpen(true);
    }
  }, [editingProductId]);

  // Brand alias detection mapping
  const detectBrand = (name) => {
    const lower = String(name || '').toLowerCase();
    if (/\b(iphone|ipad|apple)\b/.test(lower)) return 'Apple';
    if (/\b(redmi)\b/.test(lower)) return 'Redmi';
    if (/\b(mi|xiaomi)\b/.test(lower)) return 'Xiaomi';
    if (/\b(one\s*plus|oneplus)\b/.test(lower)) return 'OnePlus';
    if (/\b(pixel)\b/.test(lower)) return 'Google Pixel';
    if (/\b(poco)\b/.test(lower)) return 'Poco';
    if (/\b(samsung)\b/.test(lower)) return 'Samsung';
    if (/\b(vivo)\b/.test(lower)) return 'Vivo';
    if (/\b(oppo)\b/.test(lower)) return 'Oppo';
    if (/\b(realme)\b/.test(lower)) return 'Realme';
    if (/\b(nothing)\b/.test(lower)) return 'Nothing';
    if (/\b(motorola|moto)\b/.test(lower)) return 'Motorola';
    if (/\b(huawei)\b/.test(lower)) return 'Huawei';
    if (/\b(honor)\b/.test(lower)) return 'Honor';
    if (/\b(nokia)\b/.test(lower)) return 'Nokia';
    if (/\b(infinix)\b/.test(lower)) return 'Infinix';
    if (/\b(tecno)\b/.test(lower)) return 'Tecno';
    if (/\b(lava)\b/.test(lower)) return 'Lava';
    if (/\b(micromax)\b/.test(lower)) return 'Micromax';
    if (/\b(iqoo)\b/.test(lower)) return 'IQOO';
    if (/\b(asus)\b/.test(lower)) return 'Asus';
    if (/\b(sony)\b/.test(lower)) return 'Sony';
    if (/\b(lenovo)\b/.test(lower)) return 'Lenovo';
    return '';
  };

  // Run brand detection on name changes and auto-apply if not manually overridden
  const handleProductNameChange = (value, field) => {
    setForms((prev) => {
      const updatedProduct = { ...prev.product, [field]: value };
      
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr md:3fr', gap: '16px' }}>
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr md:1fr', gap: '16px' }}>
              <Input 
                label={role === 'shopkeeper' ? 'New Branch Quantity' : 'New Stock Quantity'} 
                type="number" 
                placeholder="Example: 15"
                value={forms.stock.quantity} 
                onChange={(v) => setForms((prev) => ({ ...prev, stock: { ...prev.stock, quantity: v } }))} 
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
              <form className="stock-product-form" onSubmit={(e) => { e.preventDefault(); onSubmitProduct(); }}>
                <div className="stock-product-flow">
                  
                  {/* Grid 1: Basic specifications */}
                  <div className="stock-product-grid stock-product-grid--identity">
                    <Input 
                      label="Short Display Name (Visible to Users)" 
                      required 
                      placeholder="Example: iPhone 13 Battery Original"
                      value={forms.product.short_name} 
                      onChange={(v) => handleProductNameChange(v, 'short_name')} 
                    />
                    <Input 
                      label="Compatible Phone Models (Full list)" 
                      required 
                      placeholder="Example: A2633, A2482, A2631"
                      value={forms.product.full_model_list} 
                      onChange={(v) => handleProductNameChange(v, 'full_model_list')} 
                    />
                    <Input 
                      label="Mobile Model (Specific code)" 
                      placeholder="Example: iPhone 13"
                      value={forms.product.model} 
                      onChange={(v) => setForms(prev => ({ ...prev, product: { ...prev.product, model: v } }))} 
                    />
                  </div>

                  {/* Grid 2: Brand and Category */}
                  <div className="stock-product-grid stock-product-grid--taxonomy">
                    <Select 
                      label="Mobile Brand" 
                      required
                      value={forms.product.brand} 
                      onChange={(v) => setForms(prev => ({ ...prev, product: { ...prev.product, brand: v } }))} 
                      options={[['', 'Choose Brand'], ...data.reference.brands.map(b => [b.name, b.name])]}
                    />
                    <Select 
                      label="Product Category" 
                      required
                      value={forms.product.category} 
                      onChange={(v) => setForms(prev => ({ ...prev, product: { ...prev.product, category: v } }))} 
                      options={[['', 'Choose Category'], ...data.reference.categories.map(c => [c.name, c.name])]}
                    />
                  </div>

                  {/* Pricing grid */}
                  <div className="stock-product-grid stock-product-grid--pricing">
                    <Input 
                      label="Selling / Retail Price (Sale)" 
                      required
                      type="number" 
                      placeholder="₹0"
                      value={forms.product.sale_price} 
                      onChange={(v) => setForms(prev => ({ ...prev, product: { ...prev.product, sale_price: v } }))} 
                    />
                    <Input 
                      label="Wholesale Price (Optional)" 
                      type="number" 
                      placeholder="₹0"
                      value={forms.product.wholesale_price} 
                      onChange={(v) => setForms(prev => ({ ...prev, product: { ...prev.product, wholesale_price: v } }))} 
                    />
                    <Input 
                      label="Purchase Cost Price (Cost)" 
                      type="number" 
                      placeholder="₹0"
                      value={forms.product.purchase_price} 
                      onChange={(v) => setForms(prev => ({ ...prev, product: { ...prev.product, purchase_price: v } }))} 
                    />
                  </div>

                  {/* Description */}
                  <div className="stock-form-field">
                    <label className="stock-form-label">Product Description / Compatibility Notes</label>
                    <textarea 
                      className="stock-form-textarea"
                      placeholder="Add compatibility specifics or replacement warnings..."
                      value={forms.product.description}
                      onChange={(e) => setForms(prev => ({ ...prev, product: { ...prev.product, description: e.target.value } }))}
                    />
                  </div>

                  {/* Colour Selection */}
                  <div className="stock-form-box">
                    <span className="stock-form-label">Product Colours Tagging</span>
                    <small className="stock-form-help">Select all colours that apply to this product. Typo-free tags keep inventory consistent.</small>
                    
                    <div className="stock-colour-chip-list">
                      {data.reference.colours.map((col) => {
                        const isSelected = forms.product.colours.split(',').map(c => c.trim()).includes(col.name);
                        return (
                          <button
                            type="button"
                            key={col.id}
                            onClick={() => handleToggleColour(col.name)}
                            className={`stock-colour-chip ${isSelected ? 'selected' : ''}`}
                          >
                            {isSelected && <Check size={12} />}
                            {col.name}
                          </button>
                        );
                      })}
                    </div>

                    {/* Inline Quick Add Colour */}
                    <div className="stock-inline-colour-add">
                      <input 
                        className="stock-inline-colour-input"
                        type="text"
                        placeholder="Type new colour..."
                        value={inlineColorInput}
                        onChange={(e) => setInlineColorInput(e.target.value)}
                      />
                      <button 
                        className="stock-inline-colour-button"
                        type="button" 
                        onClick={handleAddInlineColour}
                        disabled={saving}
                      >
                        <Plus size={12} /> Add
                      </button>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="stock-product-actions">
                    {editingProductId && (
                      <button 
                        className="soft" 
                        type="button" 
                        onClick={() => {
                          setEditingProductId('');
                          setForms((prev) => ({ ...prev, product: initialForms.product }));
                        }}
                      >
                        Cancel Edit
                      </button>
                    )}
                    <button className="primary" type="submit" disabled={saving}>
                      <Save size={16} />
                      {saving ? 'Saving...' : editingProductId ? 'Update Product' : 'Add Product'}
                    </button>
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
              <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px', marginBottom: '16px' }}>
                <button 
                  type="button" 
                  onClick={() => { setRefTab('colours'); setEditingRef(null); }}
                  style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '13px', border: 'none', cursor: 'pointer', background: refTab === 'colours' ? 'rgba(168,85,247,0.15)' : 'transparent', color: refTab === 'colours' ? '#a855f7' : 'rgba(255,255,255,0.6)' }}
                >
                  Colours
                </button>
                <button 
                  type="button" 
                  onClick={() => { setRefTab('brands'); setEditingRef(null); }}
                  style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '13px', border: 'none', cursor: 'pointer', background: refTab === 'brands' ? 'rgba(168,85,247,0.15)' : 'transparent', color: refTab === 'brands' ? '#a855f7' : 'rgba(255,255,255,0.6)' }}
                >
                  Brands {role !== 'superadmin' && <small>(Read-Only)</small>}
                </button>
                <button 
                  type="button" 
                  onClick={() => { setRefTab('categories'); setEditingRef(null); }}
                  style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '13px', border: 'none', cursor: 'pointer', background: refTab === 'categories' ? 'rgba(168,85,247,0.15)' : 'transparent', color: refTab === 'categories' ? '#a855f7' : 'rgba(255,255,255,0.6)' }}
                >
                  Categories {role !== 'superadmin' && <small>(Read-Only)</small>}
                </button>
              </div>

              {/* Creator form for selected type */}
              {(refTab === 'colours' || role === 'superadmin') ? (
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
                    } else {
                      await onAddReferenceOption('categories', newCategoryInput);
                      setNewCategoryInput('');
                    }
                  }}
                >
                  <input 
                    type="text" 
                    placeholder={`New ${refTab.slice(0, -1)} name...`}
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px', maxHeight: '250px', overflowY: 'auto', paddingRight: '6px' }}>
                {getReferenceList().map((item) => {
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
        <div className="table panel inventory-stock-table" style={{ border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', overflow: 'hidden' }}>
          {stockWithOwnership.map((item) => {
            const isLowStock = item.quantity > 0 && item.quantity <= (data.shops.find(s => s.id === item.shop_id)?.low_stock_threshold || 5);
            const isOutOfStock = Number(item.quantity) === 0;
            const isWarehouseRow = item.location_type === 'warehouse' || String(item.shop_id) === String(data.warehouse?.id);

            return (
              <div 
                className="row" 
                key={item.id} 
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '3fr 1.5fr 1.5fr 1.5fr 2fr 2fr 1.5fr', 
                  alignItems: 'center', 
                  padding: '12px 16px', 
                  borderBottom: '1px solid rgba(226,232,240,0.8)',
                  transition: 'background 0.15s ease'
                }}
              >
                
                {/* Product Name & Brand */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(20,184,166,0.08)', color: '#14b8a6', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center' }}>
                    <Smartphone size={16} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <b style={{ fontSize: '14px', color: 'var(--ink)', lineHeight: 1.25, overflowWrap: 'anywhere' }}>{productName(item)}</b>
                    {fullModelList(item) && fullModelList(item) !== productName(item) && (
                      <ExpandableText
                        className="stock-compatible-models"
                        text={fullModelList(item)}
                        limit={78}
                      />
                    )}
                    <small style={{ color: 'var(--muted)', fontSize: '11px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                      <span style={{ padding: '2px 6px', background: 'rgba(15,23,42,0.06)', color: 'var(--ink-soft)', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>{item.brand || 'No brand'}</span>
                      {!shopId && <span style={{ opacity: 0.7 }}>· {item.shop_name}</span>}
                    </small>
                  </div>
                </div>

                {/* Category */}
                <span style={{ fontSize: '13px' }}>
                  <span className="status-badge stock-ok" style={{ background: 'rgba(99,102,241,0.08)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.2)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                    {item.category || 'Mobile'}
                  </span>
                </span>

                {/* Specific Model Code */}
                <span style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>
                  {item.model || <span style={{ opacity: 0.4 }}>—</span>}
                </span>

                {/* Colours Tagged */}
                <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                  {Array.isArray(item.colours) && item.colours.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {item.colours.map((col, idx) => (
                        <span key={idx} style={{ padding: '2px 6px', background: 'rgba(15,23,42,0.06)', border: '1px solid rgba(148,163,184,0.25)', borderRadius: '4px', fontSize: '9px', color: 'var(--ink-soft)' }}>{col}</span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: 'var(--muted)' }}>No colours</span>
                  )}
                </span>

                {/* Price (Sale / Purchase Cost) */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <strong style={{ fontSize: '13px', color: '#10b981' }}>{priceLabel(item.sale_price)}</strong>
                  {role === 'superadmin' && item.purchase_price && (
                    <small style={{ fontSize: '10px', color: 'var(--muted)' }}>Cost: {priceLabel(item.purchase_price)}</small>
                  )}
                </div>

                {/* Stock Level with Warehousing breakdown */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '13px' }}>
                    {isOutOfStock ? (
                      <span style={{ padding: '2px 6px', background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>Out of Stock</span>
                    ) : isLowStock ? (
                      <span style={{ padding: '2px 6px', background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>Low Stock ({item.quantity})</span>
                    ) : (
                      <b style={{ color: '#14b8a6' }}>{item.quantity} pcs</b>
                    )}
                  </span>
                  <small style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>
                    {isWarehouseRow ? 'Warehouse' : role === 'shopkeeper' ? 'Branch stock' : 'Owner'}: <b>{item.owner_quantity}</b> - {role === 'shopkeeper' ? 'My assigned' : 'Assigned'}: <b>{role === 'shopkeeper' ? item.my_quantity : item.shopkeeper_quantity}</b>
                  </small>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
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
                    style={{ padding: '6px 10px', fontSize: '11px', background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.24)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: '#0f766e', fontWeight: 800 }}
                  >
                    Set Stock
                  </button>
                  <button 
                    type="button" 
                    title={role === 'superadmin' ? 'Edit product price' : 'Edit product details'}
                    onClick={() => onEditProduct(item)}
                    style={{ padding: role === 'superadmin' ? '6px 10px' : '6px', background: 'rgba(15,23,42,0.04)', border: '1px solid rgba(148,163,184,0.28)', borderRadius: '6px', cursor: 'pointer', color: 'var(--ink-soft)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 800 }}
                  >
                    <Edit3 size={12} />
                    {role === 'superadmin' && 'Edit Price'}
                  </button>
                  {role === 'superadmin' && (
                    <button 
                      type="button" 
                      title="Delete / Archive Product"
                      onClick={() => handleDeleteProductConfirm(item)}
                      style={{ padding: '6px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.1)', borderRadius: '6px', cursor: 'pointer', color: '#f87171' }}
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

    </section>
  );
}
