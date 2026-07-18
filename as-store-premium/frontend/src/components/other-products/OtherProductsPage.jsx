import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Edit2, Trash2, X, Package, AlertCircle } from 'lucide-react';

function Input({ label, value, onChange, type = 'text', className = '', ...inputProps }) {
  const hasValue = value !== null && value !== undefined && String(value).length > 0;
  return (
    <label className={`field-label ${hasValue ? 'has-value' : ''} ${className}`}>
      <span className="field-label-text">{label}</span>
      <input {...inputProps} placeholder={inputProps.placeholder || ' '} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Select({ label, value, onChange, options, placeholder = 'Select', className = '', ...selectProps }) {
  return (
    <label className={`field-label select-field ${value ? 'has-value' : ''} ${className}`}>
      <span className="field-label-text">{label}</span>
      <select {...selectProps} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
  );
}

export function OtherProductsPage({ session, setGlobalToast, api }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ product_name: '', product_company: '', price: '', product_category_id: '' });
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);

  const loadData = async () => {
    try {
      const [resProd, resRef] = await Promise.all([
        api('/api/other-products', {}, session.token).catch(() => []),
        api('/api/reference-data', {}, session.token).catch(() => ({ categories: [] }))
      ]);
      setProducts(resProd.filter(p => !p.category_name || p.category_name.toLowerCase() !== 'mobile display'));
      setCategories(resRef.categories || []);
    } catch (e) {
      console.error(e);
    }
  };

  React.useEffect(() => {
    loadData();
  }, []);

  const resetForm = () => {
    setFormData({ product_name: '', product_company: '', price: '', product_category_id: '' });
    setShowAdd(false);
    setEditingId(null);
  };

  const handleEdit = (prod) => {
    setFormData({ 
      product_name: prod.product_name, 
      product_company: prod.product_company || '', 
      price: prod.price || '', 
      product_category_id: prod.product_category_id || '' 
    });
    setEditingId(prod.id);
    setShowAdd(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.product_name) {
      setGlobalToast('Product name is required', 'error');
      return;
    }
    setLoading(true);
    try {
      const url = editingId ? `/api/other-products/${editingId}` : '/api/other-products';
      const method = editingId ? 'PUT' : 'POST';
      await api(url, {
        method,
        body: JSON.stringify({
          ...formData,
          price: formData.price ? Number(formData.price) : 0,
          product_category_id: formData.product_category_id ? Number(formData.product_category_id) : null
        })
      }, session.token);
      
      setGlobalToast('Product saved successfully', 'success');
      resetForm();
      loadData();
    } catch (err) {
      setGlobalToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    try {
      await api(`/api/other-products/${id}`, {
        method: 'DELETE'
      }, session.token);
      
      setGlobalToast('Product deleted successfully', 'success');
      loadData();
    } catch (err) {
      setGlobalToast(err.message, 'error');
    }
  };

  return (
    <section className="space">
      <div className="panel catalog-toolbar models-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Other Products</h2>
          <p className="text-secondary">Manage additional products outside main inventory.</p>
        </div>
        <button 
          onClick={() => { resetForm(); setShowAdd(true); }}
          className="primary"
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Plus size={18} />
          Add Product
        </button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="panel"
          >
            <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 15, alignItems: 'center' }}>
              <Input
                label="Product Name"
                placeholder="Name"
                value={formData.product_name}
                onChange={val => setFormData({ ...formData, product_name: val })}
                required
              />
              <Input
                label="Company"
                placeholder="Company / Brand"
                value={formData.product_company}
                onChange={val => setFormData({ ...formData, product_company: val })}
              />
              <Input
                label="Price (₹)"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.price}
                onChange={val => setFormData({ ...formData, price: val })}
              />
              <Select
                label="Category"
                value={formData.product_category_id}
                onChange={val => setFormData({ ...formData, product_category_id: val })}
                options={categories.map(c => [c.id, c.name])}
                placeholder="None"
              />
              <div className="actions" style={{ alignItems: 'center', display: 'flex', gap: 10 }}>
                <button type="submit" className="primary" disabled={loading}>
                  {loading ? 'Saving...' : 'Save'}
                </button>
                <button type="button" className="soft" onClick={resetForm}>
                  <X size={18} />
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="table compact-models-table">
        <div className="row header hidden-mobile">
          <div className="cell font-bold">Product Name</div>
          <div className="cell font-bold">Company</div>
          <div className="cell font-bold">Category</div>
          <div className="cell font-bold" style={{ textAlign: 'right' }}>Price</div>
          <div className="cell font-bold" style={{ textAlign: 'right' }}>Actions</div>
        </div>
        {products.length === 0 ? (
          <div className="row">
            <div className="cell" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', padding: '40px' }}>
              <AlertCircle size={48} className="text-secondary" style={{ opacity: 0.5, marginBottom: 16 }} />
              <h3>No products found</h3>
              <p className="text-secondary">Click "Add Product" to create one.</p>
            </div>
          </div>
        ) : (
          products.map((prod) => (
            <div className="row" key={prod.id}>
              <div className="cell">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Package size={16} className="text-primary" />
                  <strong>{prod.product_name}</strong>
                </div>
              </div>
              <div className="cell text-secondary">{prod.product_company || '-'}</div>
              <div className="cell">
                {prod.category_name ? (
                  <span className="badge badge-info">{prod.category_name}</span>
                ) : (
                  <span className="text-secondary">-</span>
                )}
              </div>
              <div className="cell text-right font-mono" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                ₹{Number(prod.price).toFixed(2)}
              </div>
              <div className="cell" style={{ justifyContent: 'flex-end', display: 'flex', gap: 8 }}>
                <button className="soft" onClick={() => handleEdit(prod)} title="Edit">
                  <Edit2 size={16} />
                </button>
                <button className="stock-row-button--danger" onClick={() => handleDelete(prod.id)} title="Delete">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
