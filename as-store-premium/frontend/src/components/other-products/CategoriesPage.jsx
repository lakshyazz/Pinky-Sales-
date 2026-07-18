import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Edit2, Trash2, X, Folder, AlertCircle } from 'lucide-react';

function Input({ label, value, onChange, type = 'text', className = '', ...inputProps }) {
  const hasValue = value !== null && value !== undefined && String(value).length > 0;
  return (
    <label className={`field-label ${hasValue ? 'has-value' : ''} ${className}`}>
      <span className="field-label-text">{label}</span>
      <input {...inputProps} placeholder={inputProps.placeholder || ' '} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function CategoriesPage({ session, setGlobalToast, api }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: '' });
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);

  const loadData = async () => {
    try {
      const data = await api('/api/reference-data', {}, session.token);
      setCategories(data.categories || []);
    } catch (e) {
      console.error(e);
    }
  };

  React.useEffect(() => {
    loadData();
  }, []);

  const resetForm = () => {
    setFormData({ name: '' });
    setShowAdd(false);
    setEditingId(null);
  };

  const handleEdit = (cat) => {
    setFormData({ name: cat.name });
    setEditingId(cat.id);
    setShowAdd(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name) {
      setGlobalToast('Category name is required', 'error');
      return;
    }
    setLoading(true);
    try {
      const url = editingId ? `/api/reference-data/categories/${editingId}` : '/api/reference-data/categories';
      const method = editingId ? 'PUT' : 'POST';
      const data = await api(url, {
        method,
        body: JSON.stringify(formData)
      }, session.token);
      
      setGlobalToast('Category saved successfully', 'success');
      resetForm();
      loadData();
    } catch (err) {
      setGlobalToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this category?')) return;
    try {
      await api(`/api/reference-data/categories/${id}`, {
        method: 'DELETE'
      }, session.token);
      
      setGlobalToast('Category deleted successfully', 'success');
      loadData();
    } catch (err) {
      setGlobalToast(err.message, 'error');
    }
  };

  return (
    <section className="space">
      <div className="panel catalog-toolbar models-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Product Categories</h2>
          <p className="text-secondary">Manage global product categories used across the app.</p>
        </div>
        <button 
          onClick={() => { resetForm(); setShowAdd(true); }}
          className="primary"
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Plus size={18} />
          Add Category
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
            <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 15, alignItems: 'center' }}>
              <Input
                label="Category Name"
                placeholder="e.g. Mobile Display, Keychains, Earbuds"
                value={formData.name}
                onChange={val => setFormData({ ...formData, name: val })}
                required
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
          <div className="cell font-bold">Category Name</div>
          <div className="cell font-bold" style={{ textAlign: 'right' }}>Actions</div>
        </div>
        {categories.length === 0 ? (
          <div className="row">
            <div className="cell" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', padding: '40px' }}>
              <AlertCircle size={48} className="text-secondary" style={{ opacity: 0.5, marginBottom: 16 }} />
              <h3>No categories found</h3>
              <p className="text-secondary">Click "Add Category" to create one.</p>
            </div>
          </div>
        ) : (
          categories.map((cat) => (
            <div className="row" key={cat.id}>
              <div className="cell">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Folder size={16} className="text-primary" />
                  <strong>{cat.name}</strong>
                </div>
              </div>
              <div className="cell" style={{ justifyContent: 'flex-end', display: 'flex', gap: 8 }}>
                <button className="soft" onClick={() => handleEdit(cat)} title="Edit">
                  <Edit2 size={16} />
                </button>
                <button className="stock-row-button--danger" onClick={() => handleDelete(cat.id)} title="Delete">
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
