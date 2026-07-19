import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import { 
  FileSpreadsheet, 
  UploadCloud, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  ArrowLeft, 
  Download, 
  Sparkles, 
  RefreshCw, 
  Building2, 
  UserCheck, 
  Table, 
  Check, 
  X, 
  Layers, 
  DollarSign, 
  Package, 
  History,
  ShieldCheck,
  Zap,
  HelpCircle,
  FileCheck,
  ChevronRight,
  TrendingUp,
  Store,
  Sliders,
  CheckCircle
} from 'lucide-react';

// Common field mappings dictionary for fuzzy auto-matching
const TARGET_FIELDS = [
  { 
    key: 'short_name', 
    label: 'Product Name / Description', 
    required: true, 
    description: 'Main model or item description',
    aliases: ['product name', 'item description', 'particulars', 'item name', 'model', 'product', 'name', 'item', 'description', 'goods', 'material'] 
  },
  { 
    key: 'brand', 
    label: 'Brand Name', 
    required: false, 
    description: 'Manufacturer / brand label',
    aliases: ['brand', 'brand name', 'make', 'manufacturer', 'company'] 
  },
  { 
    key: 'category', 
    label: 'Category', 
    required: false, 
    description: 'Product classification',
    aliases: ['category', 'product type', 'group', 'type', 'cat', 'dept', 'department'] 
  },
  { 
    key: 'full_model_list', 
    label: 'Compatible Models', 
    required: false, 
    description: 'Compatible device model numbers',
    aliases: ['compatible models', 'fits models', 'model list', 'supported devices', 'compatibility', 'models'] 
  },
  { 
    key: 'quantity', 
    label: 'Stock Quantity (Pcs)', 
    required: true, 
    description: 'Number of units in batch',
    aliases: ['qty', 'quantity', 'pcs', 'pieces', 'stock', 'count', 'balance', 'in stock', 'available qty'] 
  },
  { 
    key: 'purchase_price', 
    label: 'Cost / Purchase Price (₹)', 
    required: false, 
    description: 'Unit cost paid to supplier',
    aliases: ['purchase price', 'cost price', 'unit cost', 'cp', 'cost', 'buy price', 'rate', 'purchase rate'] 
  },
  { 
    key: 'wholesale_price', 
    label: 'Wholesale Price (₹)', 
    required: false, 
    description: 'B2B selling rate',
    aliases: ['wholesale price', 'trade price', 'dealer price', 'wp', 'wholesale'] 
  },
  { 
    key: 'retail_price', 
    label: 'Retail Selling Price (₹)', 
    required: false, 
    description: 'Customer MRP / sale rate',
    aliases: ['retail price', 'sale price', 'selling price', 'mrp', 'sp', 'retail', 'list price'] 
  },
  { 
    key: 'colour', 
    label: 'Colour / Variant', 
    required: false, 
    description: 'Item color specification',
    aliases: ['colour', 'color', 'variant', 'shade'] 
  },
  { 
    key: 'notes', 
    label: 'Invoice / Batch Notes', 
    required: false, 
    description: 'Supplier invoice or reference number',
    aliases: ['notes', 'remarks', 'invoice', 'vendor', 'supplier', 'invoice no'] 
  },
];

export default function SupplierImportWorkspace({
  data = {},
  api,
  setGlobalToast = () => {},
  onImportComplete = () => {}
}) {
  const [step, setStep] = useState(1); // 1: Upload, 2: Column Mapping, 3: Validation & Settings, 4: Results
  const [fileName, setFileName] = useState('');
  const [rawHeaders, setRawHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [fieldMapping, setFieldMapping] = useState({});
  const [destinationShopId, setDestinationShopId] = useState(data.shops?.[0]?.id || 1);
  const [defaultAssignedUserId, setDefaultAssignedUserId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importLogs, setImportLogs] = useState([]);
  const [showLogsDrawer, setShowLogsDrawer] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Fetch import logs history
  const fetchImportLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await api('/inventory/import-logs');
      setImportLogs(res.logs || []);
    } catch (err) {
      console.warn('Unable to load import logs history', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (showLogsDrawer) {
      fetchImportLogs();
    }
  }, [showLogsDrawer]);

  // Auto-guess column headers when file is loaded
  const autoDetectColumns = (headers = []) => {
    const mapping = {};
    const lowerHeaders = headers.map((h) => String(h).trim().toLowerCase());

    TARGET_FIELDS.forEach((field) => {
      let matchedHeader = '';
      for (const alias of field.aliases) {
        const idx = lowerHeaders.findIndex((h) => h === alias || h.includes(alias));
        if (idx !== -1) {
          matchedHeader = headers[idx];
          break;
        }
      }
      if (matchedHeader) {
        mapping[field.key] = matchedHeader;
      }
    });

    setFieldMapping(mapping);
  };

  // Process Excel/CSV File Upload
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!json.length) {
          setGlobalToast({ message: 'The uploaded file contains no data rows.', type: 'error' });
          return;
        }

        const headers = Object.keys(json[0]);
        setRawHeaders(headers);
        setRawRows(json);
        autoDetectColumns(headers);
        setStep(2);
      } catch (err) {
        console.error('[ExcelParse] Error reading Excel file:', err);
        setGlobalToast({ message: 'Failed to parse Excel file. Please ensure it is a valid .xlsx or .csv file.', type: 'error' });
      }
    };

    reader.readAsBinaryString(file);
  };

  // Generate transformed payload from current field mappings
  const mappedRecords = useMemo(() => {
    if (!rawRows.length) return [];
    return rawRows.map((row, idx) => {
      const getVal = (fieldKey) => {
        const colHeader = fieldMapping[fieldKey];
        if (!colHeader) return '';
        return row[colHeader];
      };

      return {
        short_name: String(getVal('short_name') || '').trim(),
        brand: String(getVal('brand') || 'Generic').trim(),
        category: String(getVal('category') || 'General').trim(),
        full_model_list: String(getVal('full_model_list') || '').trim(),
        quantity: Math.max(1, Number(getVal('quantity') || 1)),
        purchase_price: Number(getVal('purchase_price') || 0),
        wholesale_price: Number(getVal('wholesale_price') || 0),
        retail_price: Number(getVal('retail_price') || 0),
        colour: String(getVal('colour') || '').trim(),
        notes: String(getVal('notes') || '').trim(),
        source_key: `IMP-${fileName}-${idx}-${Date.now()}`
      };
    }).filter((r) => r.short_name);
  }, [rawRows, fieldMapping, fileName]);

  // Derived valuation metrics for Step 3
  const previewMetrics = useMemo(() => {
    const totalQty = mappedRecords.reduce((acc, r) => acc + (r.quantity || 0), 0);
    const totalValuation = mappedRecords.reduce((acc, r) => acc + ((r.purchase_price || r.retail_price || 0) * (r.quantity || 0)), 0);
    const uniqueBrands = new Set(mappedRecords.map(r => r.brand).filter(Boolean)).size;
    const uniqueCategories = new Set(mappedRecords.map(r => r.category).filter(Boolean)).size;
    return { totalQty, totalValuation, uniqueBrands, uniqueCategories };
  }, [mappedRecords]);

  // Execute Bulk Import to Backend
  const handleExecuteImport = async () => {
    if (!mappedRecords.length) {
      setGlobalToast({ message: 'No valid records to import. Please check your column mappings.', type: 'error' });
      return;
    }

    setImporting(true);
    try {
      const res = await api('/inventory/bulk-import', {
        method: 'POST',
        body: JSON.stringify({
          fileName,
          destinationShopId,
          defaultAssignedUserId: defaultAssignedUserId || null,
          records: mappedRecords
        })
      });

      setImportResult(res.summary);
      setStep(4);
      setGlobalToast({ message: `Successfully imported ${res.summary.createdBatches} inventory batches!`, tone: 'success' });
      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error('[BulkImport] Execution failed:', err);
      setGlobalToast({ message: err.message || 'Failed to complete inventory import.', tone: 'error' });
    } finally {
      setImporting(false);
    }
  };

  // Download Clean Sample Excel Template
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Product Description': 'iPhone 13 Display Complete Assembly',
        'Brand': 'Apple',
        'Category': 'Display',
        'Compatible Models': 'iPhone 13, A2633',
        'Quantity (Pcs)': 25,
        'Cost Price (₹)': 2400,
        'Wholesale Price (₹)': 2900,
        'Retail Selling Price (₹)': 3400,
        'Colour Variant': 'Black',
        'Batch Notes': 'Vendor Invoice #INV-8821'
      },
      {
        'Product Description': 'Samsung S21 Ultra Battery Pack 5000mAh',
        'Brand': 'Samsung',
        'Category': 'BATTERY',
        'Compatible Models': 'Galaxy S21 Ultra, SM-G998B',
        'Quantity (Pcs)': 50,
        'Cost Price (₹)': 650,
        'Wholesale Price (₹)': 850,
        'Retail Selling Price (₹)': 1100,
        'Colour Variant': 'Original',
        'Batch Notes': 'Vendor Invoice #INV-8821'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sample Inventory');
    XLSX.writeFile(workbook, 'AS_Store_Inventory_Import_Template.xlsx');
  };

  const stepsList = [
    { num: 1, title: 'Upload Spreadsheet', sub: 'Excel / CSV' },
    { num: 2, title: 'Smart Auto-Mapping', sub: 'Match Columns' },
    { num: 3, title: 'Review & Allocate', sub: 'Branch & Valuation' },
    { num: 4, title: 'Import Summary', sub: 'Audit Complete' },
  ];

  return (
    <div className="space-y-8 pb-12">
      
      {/* Top Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-slate-950 p-6 md:p-10 text-white shadow-2xl border border-slate-800">
        {/* Glow Accents */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-teal-500/15 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-xs font-bold uppercase tracking-wider shadow-sm">
              <Zap className="w-3.5 h-3.5 text-emerald-400 animate-pulse" /> AI-Assisted Supplier Ingestion
            </div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight text-white leading-tight">
              Supplier Excel & CSV Batch Ingestion
            </h1>
            <p className="text-slate-300 text-xs md:text-sm font-medium leading-relaxed">
              Upload supplier stock sheets in any custom format. Our intelligent fuzzy engine automatically transforms column headers into AS Store FIFO inventory, catalog models, and valuation records.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="px-5 py-3 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-white font-bold text-xs flex items-center gap-2.5 transition-all shadow-lg hover:shadow-emerald-900/20 active:scale-95"
            >
              <Download className="w-4 h-4 text-emerald-400" /> Download Sample Excel
            </button>

            <button
              type="button"
              onClick={() => setShowLogsDrawer(true)}
              className="px-5 py-3 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-bold text-xs flex items-center gap-2.5 transition-all shadow-lg active:scale-95"
            >
              <History className="w-4 h-4 text-emerald-400" /> View Import Audit History
            </button>
          </div>
        </div>
      </div>

      {/* Main Interactive Container */}
      <div className="bg-white border border-slate-200/90 rounded-3xl shadow-2xl shadow-slate-200/60 p-6 md:p-10 space-y-8">
        
        {/* Futuristic Interactive Wizard Step Tracker */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-2 bg-slate-50/80 border border-slate-200/80 rounded-2xl">
          {stepsList.map((s) => {
            const isActive = step === s.num;
            const isDone = step > s.num;
            return (
              <div
                key={s.num}
                className={`relative flex items-center gap-3 p-3.5 rounded-xl transition-all duration-300 ${
                  isActive
                    ? 'bg-white shadow-md border border-emerald-200/80 text-slate-900 ring-2 ring-emerald-500/20'
                    : isDone
                    ? 'bg-emerald-50/50 text-emerald-900 border border-emerald-100'
                    : 'text-slate-400 opacity-70'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0 transition-transform ${
                    isActive
                      ? 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-md shadow-emerald-600/30 scale-105'
                      : isDone
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {isDone ? <Check className="w-4 h-4" /> : s.num}
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-black block truncate">{s.title}</span>
                  <span className="text-[10px] font-bold text-slate-400 block truncate">{s.sub}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* STEP 1: Ultra-Premium File Upload Dropzone */}
        {step === 1 && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-8 py-4"
          >
            {/* High-Tech Upload Vault */}
            <div className="relative max-w-3xl mx-auto group">
              <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-3xl blur-xl opacity-20 group-hover:opacity-40 transition duration-500 pointer-events-none" />
              
              <div className="relative border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-gradient-to-b from-emerald-50/30 via-white to-slate-50/50 rounded-3xl p-10 md:p-14 text-center cursor-pointer transition-all duration-300 shadow-xl">
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                />
                
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-emerald-600/40 group-hover:scale-110 transition-transform duration-300">
                  <UploadCloud className="w-10 h-10" />
                </div>

                <h3 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                  Drag & Drop Supplier Inventory File
                </h3>
                <p className="text-xs md:text-sm text-slate-500 mt-2 font-medium max-w-md mx-auto">
                  Upload supplier spreadsheets in Microsoft Excel (<span className="font-bold text-slate-800">.XLSX, .XLS</span>) or CSV (<span className="font-bold text-slate-800">.CSV</span>) format.
                </p>

                <div className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs shadow-lg shadow-emerald-600/25 transition-all group-hover:shadow-emerald-600/40">
                  <FileSpreadsheet className="w-4 h-4" /> Browse Files from Computer
                </div>
              </div>
            </div>

            {/* Feature Highlights Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 max-w-4xl mx-auto pt-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900">Auto-Column Matching</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Intelligently detects product names, prices & stock qty.</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900">FIFO Inventory Safety</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Preserves batch purchase costs and retail profit margins.</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-cyan-100 text-cyan-700 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900">Multi-Shop Routing</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Directly allocate batches to any shop or central warehouse.</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                  <FileCheck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900">Valuation Audit Trail</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Logs total added stock valuation and row counts.</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* STEP 2: Smart Interactive Column Mapper */}
        {step === 2 && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 text-white shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-400 flex items-center justify-center shrink-0">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">Intelligent Column Auto-Matching</h3>
                  <p className="text-xs text-slate-400 font-medium">Verify or adjust mapped spreadsheet headers before importing.</p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="px-3 py-1.5 rounded-xl bg-slate-800 text-emerald-400 font-extrabold text-xs border border-slate-700">
                  📁 {fileName} ({rawRows.length} rows)
                </span>
                <button
                  type="button"
                  onClick={() => autoDetectColumns(rawHeaders)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1 border border-slate-700 transition-all"
                  title="Re-run auto matcher"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Re-Match
                </button>
              </div>
            </div>

            {/* Field Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {TARGET_FIELDS.map((field) => {
                const isMatched = Boolean(fieldMapping[field.key]);
                const sampleVal = rawRows[0]?.[fieldMapping[field.key]];

                return (
                  <div
                    key={field.key}
                    className={`p-4 rounded-2xl border transition-all ${
                      isMatched
                        ? 'bg-emerald-50/30 border-emerald-200/90 shadow-sm'
                        : field.required
                        ? 'bg-rose-50/20 border-rose-200'
                        : 'bg-slate-50/60 border-slate-200/80'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs font-black text-slate-900">{field.label}</label>
                        {field.required && (
                          <span className="text-rose-500 font-black text-xs">*</span>
                        )}
                      </div>

                      {isMatched ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase flex items-center gap-1">
                          <Check className="w-3 h-3" /> Auto-Matched
                        </span>
                      ) : field.required ? (
                        <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-black uppercase">
                          Required
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-600 text-[10px] font-bold">
                          Optional
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-400 font-medium mb-2">{field.description}</p>

                    <select
                      value={fieldMapping[field.key] || ''}
                      onChange={(e) => setFieldMapping({ ...fieldMapping, [field.key]: e.target.value })}
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    >
                      <option value="">-- Do Not Import / Leave Blank --</option>
                      {rawHeaders.map((header) => (
                        <option key={header} value={header}>
                          Excel Column: "{header}"
                        </option>
                      ))}
                    </select>

                    {/* Sample preview value from 1st row */}
                    {isMatched && sampleVal !== undefined && (
                      <div className="mt-2 text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
                        <span className="text-slate-400 font-bold uppercase text-[9px]">Sample Value:</span>
                        <span className="font-bold text-slate-800 truncate bg-white px-2 py-0.5 rounded-md border border-slate-200">
                          {String(sampleVal) || '(blank)'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Navigation Footer */}
            <div className="flex items-center justify-between pt-6 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-all"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Upload
              </button>

              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={!fieldMapping.short_name || !fieldMapping.quantity}
                className="px-7 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50 transition-all"
              >
                Continue to Review ({mappedRecords.length} Records) <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* STEP 3: Validation, Preview & Branch Allocation */}
        {step === 3 && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* Branch Allocation Banner */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-slate-900 to-emerald-950 text-white shadow-xl border border-slate-800">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase tracking-wider">
                  <Store className="w-3 h-3" /> Branch Allocation
                </div>
                <h3 className="text-lg font-black text-white">Target Shop / Warehouse Selection</h3>
                <p className="text-xs text-slate-300 font-medium">Choose which branch inventory registry will receive these imported stock batches.</p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <select
                  value={destinationShopId}
                  onChange={(e) => setDestinationShopId(Number(e.target.value))}
                  className="px-4 py-2.5 bg-white text-slate-900 font-black text-xs rounded-xl border-0 outline-none shadow-lg"
                >
                  {(data.shops || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      📍 {s.name} {s.area ? `(${s.area})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Valid Records</span>
                <span className="text-xl font-black text-slate-900">{mappedRecords.length} rows</span>
              </div>
              <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80">
                <span className="text-[10px] font-black uppercase text-emerald-700 block mb-1">Total Stock Added</span>
                <span className="text-xl font-black text-emerald-800">{previewMetrics.totalQty} pcs</span>
              </div>
              <div className="p-4 rounded-2xl bg-teal-50/60 border border-teal-200/80">
                <span className="text-[10px] font-black uppercase text-teal-700 block mb-1">Estimated Valuation</span>
                <span className="text-xl font-black text-teal-800">₹{previewMetrics.totalValuation?.toLocaleString('en-IN')}</span>
              </div>
              <div className="p-4 rounded-2xl bg-cyan-50/60 border border-cyan-200/80">
                <span className="text-[10px] font-black uppercase text-cyan-700 block mb-1">New Catalog Groups</span>
                <span className="text-xl font-black text-cyan-800">{previewMetrics.uniqueBrands} Brands · {previewMetrics.uniqueCategories} Cats</span>
              </div>
            </div>

            {/* Transformed Data Preview Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider">Live Transformed Data Preview (First 5 Rows)</h4>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                  Ready to Commit
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-200/80 rounded-2xl shadow-sm">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-extrabold uppercase">
                      <th className="p-3.5">Product Name</th>
                      <th className="p-3.5">Brand</th>
                      <th className="p-3.5">Category</th>
                      <th className="p-3.5">Compatible Models</th>
                      <th className="p-3.5 text-right">Quantity</th>
                      <th className="p-3.5 text-right">Cost Price (₹)</th>
                      <th className="p-3.5 text-right">Retail Price (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {mappedRecords.slice(0, 5).map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3.5 font-bold text-slate-900">{row.short_name}</td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-[11px] font-bold">
                            {row.brand}
                          </span>
                        </td>
                        <td className="p-3.5">{row.category}</td>
                        <td className="p-3.5 max-w-xs truncate text-slate-500">{row.full_model_list || 'N/A'}</td>
                        <td className="p-3.5 text-right font-black text-emerald-600">{row.quantity} pcs</td>
                        <td className="p-3.5 text-right font-bold text-slate-800">₹{row.purchase_price}</td>
                        <td className="p-3.5 text-right font-bold text-teal-700">₹{row.retail_price}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Execution Buttons */}
            <div className="flex items-center justify-between pt-6 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-all"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Mapping
              </button>

              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={importing}
                className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-black text-xs flex items-center gap-2.5 shadow-xl shadow-emerald-600/30 active:scale-95 transition-all disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Ingesting Inventory Batches into Database...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Commit Bulk Import ({mappedRecords.length} Items)
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}

        {/* STEP 4: Execution & Completion Dashboard */}
        {step === 4 && importResult && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-8 text-center py-6"
          >
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white flex items-center justify-center mx-auto mb-2 shadow-2xl shadow-emerald-500/30">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                Inventory Ingestion Complete!
              </h3>
              <p className="text-xs md:text-sm text-slate-500 font-medium max-w-md mx-auto">
                All supplier stock rows have been transformed and saved into AS Store FIFO inventory batches.
              </p>
            </div>

            {/* Results Metric Dashboard */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto pt-2">
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Batches Created</span>
                <span className="text-3xl font-black text-slate-900">{importResult.createdBatches}</span>
              </div>
              <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200/80">
                <span className="text-[10px] font-black uppercase text-emerald-700 block mb-1">New Catalog Items</span>
                <span className="text-3xl font-black text-emerald-800">{importResult.createdProducts}</span>
              </div>
              <div className="p-5 rounded-2xl bg-teal-50 border border-teal-200/80">
                <span className="text-[10px] font-black uppercase text-teal-700 block mb-1">Total Stock Added</span>
                <span className="text-3xl font-black text-teal-800">{importResult.totalQuantityAdded} pcs</span>
              </div>
              <div className="p-5 rounded-2xl bg-cyan-50 border border-cyan-200/80">
                <span className="text-[10px] font-black uppercase text-cyan-700 block mb-1">Total Valuation</span>
                <span className="text-3xl font-black text-cyan-800">₹{importResult.totalValuation?.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div className="pt-4 flex flex-wrap items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setFileName('');
                  setRawRows([]);
                  setImportResult(null);
                }}
                className="px-6 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-lg"
              >
                Import Another Supplier File
              </button>

              <button
                type="button"
                onClick={() => setShowLogsDrawer(true)}
                className="px-6 py-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-800 font-bold text-xs transition-all"
              >
                View Historic Import Logs
              </button>
            </div>
          </motion.div>
        )}

      </div>

      {/* Historic Import Audit Logs Drawer Modal */}
      <AnimatePresence>
        {showLogsDrawer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden"
            >
              {/* Drawer Header */}
              <div className="p-6 bg-slate-950 text-white flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black">Supplier Import Audit History</h3>
                    <p className="text-xs text-slate-400">Review past bulk inventory ingestion logs and total valuations.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLogsDrawer(false)}
                  className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Logs Content */}
              <div className="p-6 overflow-y-auto space-y-4 flex-1">
                {loadingLogs ? (
                  <div className="py-12 text-center text-slate-400 font-medium text-xs flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" /> Loading import history...
                  </div>
                ) : !importLogs.length ? (
                  <div className="py-12 text-center text-slate-400 font-medium text-xs">
                    No supplier import history records found.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-extrabold uppercase">
                          <th className="p-3">Import Date</th>
                          <th className="p-3">File Name</th>
                          <th className="p-3">Destination Branch</th>
                          <th className="p-3 text-right">Rows</th>
                          <th className="p-3 text-right">Added Qty</th>
                          <th className="p-3 text-right">Total Valuation (₹)</th>
                          <th className="p-3">Importer</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {importLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50">
                            <td className="p-3 font-bold text-slate-900">
                              {new Date(log.import_timestamp).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </td>
                            <td className="p-3 font-bold text-emerald-700 max-w-xs truncate">{log.file_name}</td>
                            <td className="p-3">{log.shop_name || `Shop #${log.destination_shop_id}`}</td>
                            <td className="p-3 text-right font-bold">{log.total_rows}</td>
                            <td className="p-3 text-right font-black text-emerald-600">{log.total_quantity} pcs</td>
                            <td className="p-3 text-right font-black text-teal-700">₹{Number(log.total_valuation || 0).toLocaleString('en-IN')}</td>
                            <td className="p-3">{log.importer_name || 'Super Admin'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Drawer Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowLogsDrawer(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs"
                >
                  Close History
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
