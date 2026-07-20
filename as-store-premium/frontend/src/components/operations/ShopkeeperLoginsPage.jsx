import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  UserPlus, 
  Store, 
  Phone, 
  AtSign, 
  Lock, 
  Eye, 
  EyeOff, 
  Edit3, 
  Trash2, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  Sparkles,
  LayoutGrid,
  List,
  Building2,
  X
} from 'lucide-react';

export default function ShopkeeperLoginsPage({
  data = {},
  forms = {},
  setForms,
  staffedBranchCount = 0,
  incompleteShopkeeperContacts = 0,
  saving = false,
  submitShopkeeper,
  deleteShopkeeper,
  openShopkeeperEditor,
  shopkeeperSearch = '',
  setShopkeeperSearch,
  visibleShopkeepers = [],
  Empty
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'grid'

  const shopkeeperForm = forms.shopkeeper || {};
  const shopForm = forms.shop || {};
  const shopList = data.shops || [];

  // Gradient badge colors helper based on initials
  const getAvatarGradient = (name = '') => {
    const charCode = name.charCodeAt(0) || 65;
    const gradients = [
      'from-emerald-500 to-teal-600 text-white shadow-emerald-500/20',
      'from-cyan-500 to-blue-600 text-white shadow-cyan-500/20',
      'from-indigo-500 to-purple-600 text-white shadow-indigo-500/20',
      'from-amber-500 to-orange-600 text-white shadow-amber-500/20',
      'from-rose-500 to-pink-600 text-white shadow-rose-500/20',
    ];
    return gradients[charCode % gradients.length];
  };

  return (
    <div className="space-y-6">
      
      {/* Metrics & Overview Row */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xl shadow-slate-200/40 backdrop-blur-xl">
        <div className="lg:col-span-2 space-y-1.5 self-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 border border-teal-200/60 text-teal-700 text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" /> Staff Access Panel
          </div>
          <h2 className="text-xl font-black text-slate-900">Shopkeeper Accounts & Credentials</h2>
          <p className="text-xs text-slate-500 font-medium">Create and manage access credentials for your branch shopkeepers safely.</p>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-3 gap-3 lg:col-span-2">
          <div className="bg-slate-50 border border-slate-200/50 p-3.5 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 text-[9px] uppercase font-bold tracking-wider">
              <span>Total Staff</span>
              <Users className="w-4 h-4 text-teal-600" />
            </div>
            <span className="text-xl font-black text-slate-900 mt-1">{(data.shopkeepers || []).length}</span>
          </div>

          <div className="bg-slate-50 border border-slate-200/50 p-3.5 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 text-[9px] uppercase font-bold tracking-wider">
              <span>Staffed</span>
              <Building2 className="w-4 h-4 text-cyan-600" />
            </div>
            <span className="text-xl font-black text-slate-900 mt-1">{staffedBranchCount}</span>
          </div>

          <div className="bg-slate-50 border border-slate-200/50 p-3.5 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 text-[9px] uppercase font-bold tracking-wider">
              <span>Missing Contact</span>
              {incompleteShopkeeperContacts > 0 ? (
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              )}
            </div>
            <span className={`text-xl font-black mt-1 ${incompleteShopkeeperContacts > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {incompleteShopkeeperContacts}
            </span>
          </div>
        </div>
      </div>

      {/* Creation Workspace Card */}
      <motion.div 
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-slate-200/80 rounded-3xl shadow-xl shadow-slate-200/40 p-6 md:p-8 overflow-hidden relative"
      >
        <div className="flex items-center gap-3 pb-5 mb-6 border-b border-slate-100">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-lg shadow-teal-500/20">
            <UserPlus className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">Create Shopkeeper Account</h2>
            <p className="text-xs text-slate-500 font-medium">Add a new staff login and assign them to an active retail branch.</p>
          </div>
        </div>

        <form onSubmit={submitShopkeeper} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Full Name */}
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1.5">
                Staff Full Name *
              </label>
              <div className="relative">
                <Users className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  maxLength={80}
                  autoComplete="name"
                  placeholder="e.g. Ramesh Kumar"
                  value={shopkeeperForm.name || ''}
                  onChange={(e) => setForms({ ...forms, shopkeeper: { ...forms.shopkeeper, name: e.target.value } })}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/10 transition-all"
                />
              </div>
            </div>

            {/* Mobile Contact */}
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1.5">
                Mobile Number *
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="tel"
                  required
                  maxLength={30}
                  autoComplete="tel"
                  placeholder="e.g. 9876543210"
                  value={shopkeeperForm.contact || ''}
                  onChange={(e) => setForms({ ...forms, shopkeeper: { ...forms.shopkeeper, contact: e.target.value } })}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/10 transition-all"
                />
              </div>
            </div>

            {/* Username */}
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1.5">
                Login Username *
              </label>
              <div className="relative">
                <AtSign className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={40}
                  autoComplete="off"
                  placeholder="e.g. ramesh_asstore"
                  value={shopkeeperForm.username || ''}
                  onChange={(e) => setForms({ ...forms, shopkeeper: { ...forms.shopkeeper, username: e.target.value } })}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/10 transition-all"
                />
              </div>
            </div>

            {/* Password with Eye Toggle */}
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1.5">
                Portal Password *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  maxLength={200}
                  autoComplete="new-password"
                  placeholder="Minimum 6 characters"
                  value={shopkeeperForm.password || ''}
                  onChange={(e) => setForms({ ...forms, shopkeeper: { ...forms.shopkeeper, password: e.target.value } })}
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/10 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Assigned Shop Dropdown */}
            <div className="md:col-span-2">
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1.5">
                Assign Retail Branch / Shop *
              </label>
              <div className="relative">
                <Store className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
                <select
                  required
                  value={shopkeeperForm.shop_id || ''}
                  onChange={(e) => setForms({ ...forms, shopkeeper: { ...forms.shopkeeper, shop_id: e.target.value } })}
                  className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/10 transition-all appearance-none cursor-pointer"
                >
                  <option value="">Select branch for staff member...</option>
                  {shopList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.area ? `(${s.area})` : ''}
                    </option>
                  ))}
                  <option value="new_shop" className="font-extrabold text-teal-700 bg-teal-50">
                    + Add New Branch / Shop
                  </option>
                </select>
              </div>
            </div>
          </div>

          {/* Inline New Shop Form Sub-Card */}
          {shopkeeperForm.shop_id === 'new_shop' && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="p-5 rounded-2xl bg-teal-50/60 border border-teal-200/80 space-y-3"
            >
              <div className="flex items-center gap-2 text-teal-900 font-extrabold text-xs uppercase tracking-wider">
                <Store className="w-4 h-4 text-teal-600" /> New Branch Details
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Shop Name *"
                  value={shopForm.name || ''}
                  onChange={(e) => setForms({ ...forms, shop: { ...forms.shop, name: e.target.value } })}
                  className="px-3.5 py-2 bg-white border border-teal-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-teal-500"
                />
                <input
                  type="text"
                  placeholder="Area / Location *"
                  value={shopForm.area || ''}
                  onChange={(e) => setForms({ ...forms, shop: { ...forms.shop, area: e.target.value } })}
                  className="px-3.5 py-2 bg-white border border-teal-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-teal-500"
                />
                <input
                  type="text"
                  placeholder="Address (Optional)"
                  value={shopForm.address || ''}
                  onChange={(e) => setForms({ ...forms, shop: { ...forms.shop, address: e.target.value } })}
                  className="px-3.5 py-2 bg-white border border-teal-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-teal-500"
                />
                <input
                  type="text"
                  placeholder="Phone (Optional)"
                  value={shopForm.phone || ''}
                  onChange={(e) => setForms({ ...forms, shop: { ...forms.shop, phone: e.target.value } })}
                  className="px-3.5 py-2 bg-white border border-teal-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-teal-500"
                />
              </div>
            </motion.div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-end pt-3 border-t border-slate-100">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-teal-600 via-emerald-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-black text-xs flex items-center gap-2 shadow-lg shadow-teal-600/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" />
              {saving ? 'Creating Login Credentials...' : 'Create Staff Login'}
            </button>
          </div>
        </form>
      </motion.div>

      {/* Staff Directory Section */}
      <div className="bg-white border border-slate-200/80 rounded-3xl shadow-xl shadow-slate-200/40 p-6 md:p-8 space-y-6">
        
        {/* Toolbar Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-teal-600 block mb-0.5">
              Login Directory
            </span>
            <h2 className="text-xl font-black text-slate-900">Active Staff Accounts</h2>
            <p className="text-xs text-slate-500 font-medium">Search and manage credentials for all registered shopkeepers.</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Search Input */}
            <div className="relative min-w-[240px]">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={shopkeeperSearch}
                onChange={(e) => setShopkeeperSearch(e.target.value)}
                placeholder="Search staff, username, branch..."
                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:bg-white transition-all"
              />
              {shopkeeperSearch && (
                <button
                  type="button"
                  onClick={() => setShopkeeperSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/60">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === 'table' ? 'bg-white text-teal-700 shadow-sm font-bold' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Table List View"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === 'grid' ? 'bg-white text-teal-700 shadow-sm font-bold' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Grid Cards View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>

            <span className="px-3 py-1.5 rounded-xl bg-teal-50 border border-teal-200/60 text-teal-800 font-extrabold text-xs shrink-0">
              {visibleShopkeepers.length} Logins
            </span>
          </div>
        </div>

        {/* Directory Content */}
        {visibleShopkeepers.length ? (
          viewMode === 'table' ? (
            /* Table / Row View */
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/80 text-[10px] uppercase font-black tracking-wider text-slate-500">
                    <th className="p-4">Staff Member & Username</th>
                    <th className="p-4">Mobile Contact</th>
                    <th className="p-4">Assigned Branch</th>
                    <th className="p-4">Access Role</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleShopkeepers.map((user) => {
                    const initials = user.name
                      ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
                      : 'SK';

                    return (
                      <tr key={user.id} className="hover:bg-slate-50/80 transition-colors group">
                        
                        {/* Name & Username Column - Glitch Fixed with clean spacing */}
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${getAvatarGradient(user.name)} flex items-center justify-center font-black text-xs shadow-md shrink-0`}>
                              {initials}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-black text-slate-900 group-hover:text-teal-700 transition-colors truncate">
                                {user.name}
                              </span>
                              <span className="text-[11px] font-bold text-slate-400 truncate">
                                @{user.username}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Contact */}
                        <td className="p-4">
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100/80 text-slate-700 text-xs font-bold border border-slate-200/60">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            <span>{user.contact || 'Not provided'}</span>
                          </div>
                        </td>

                        {/* Assigned Shop */}
                        <td className="p-4">
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-cyan-50 text-cyan-800 text-xs font-bold border border-cyan-200/60">
                            <Store className="w-3.5 h-3.5 text-cyan-600" />
                            <span>{user.shop_name || 'No shop assigned'}</span>
                          </div>
                        </td>

                        {/* Role */}
                        <td className="p-4">
                          <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[11px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" /> Branch Staff
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="p-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => openShopkeeperEditor(user)}
                              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-700 font-bold text-xs inline-flex items-center gap-1.5 border border-slate-200/60 transition-all"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Edit
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => deleteShopkeeper(user)}
                              className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs inline-flex items-center gap-1.5 border border-rose-200/60 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Grid View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleShopkeepers.map((user) => {
                const initials = user.name
                  ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
                  : 'SK';

                return (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-md hover:shadow-xl transition-all flex flex-col justify-between space-y-4 group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${getAvatarGradient(user.name)} flex items-center justify-center font-black text-sm shadow-md shrink-0`}>
                          {initials}
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-slate-900 group-hover:text-teal-700 transition-colors">{user.name}</h3>
                          <p className="text-xs font-bold text-slate-400">@{user.username}</p>
                        </div>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black uppercase">
                        Staff
                      </span>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-slate-100 text-xs font-bold">
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="text-slate-400 font-medium">Contact:</span>
                        <span className="flex items-center gap-1 text-slate-800"><Phone className="w-3.5 h-3.5 text-slate-400" /> {user.contact || 'N/A'}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="text-slate-400 font-medium">Branch:</span>
                        <span className="flex items-center gap-1 text-teal-700"><Store className="w-3.5 h-3.5 text-teal-600" /> {user.shop_name || 'Unassigned'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => openShopkeeperEditor(user)}
                        className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteShopkeeper(user)}
                        className="flex-1 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )
        ) : (
          <Empty title={shopkeeperSearch ? `No staff logins match "${shopkeeperSearch}"` : 'No shopkeeper accounts registered yet.'} />
        )}
      </div>

    </div>
  );
}
