import React, { useState, useMemo } from 'react';
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
  ShieldCheck
} from 'lucide-react';

// Common field mappings dictionary for fuzzy auto-matching
const TARGET_FIELDS = [
  { key: 'short_name', label: 'Product Name / Description *', required: true, aliases: ['product name', 'item description', 'particulars', 'item name', 'model', 'product', 'name', 'item', 'description', 'goods', 'material'] },
  { key: 'brand', label: 'Brand', required: false, aliases: ['brand', 'brand name', 'make', 'manufacturer', 'company'] },
  { key: 'category', label: 'Category', required: false, aliases: ['category', 'product type', 'group', 'type', 'cat', 'dept', 'department'] },
  { key: 'full_model_list', label: 'Compatible Models', required: false, aliases: ['compatible models', 'fits models', 'model list', 'supported devices', 'compatibility', 'models'] },
  { key: 'quantity', label: 'Stock Quantity (Pcs) *', required: true, aliases: ['qty', 'quantity', 'pcs', 'pieces', 'stock', 'count', 'balance', 'in stock', 'available qty'] },
  { key: 'purchase_price', label: 'Cost / Purchase Price (₹)', required: false, aliases: ['purchase price', 'cost price', 'unit cost', 'cp', 'cost', 'buy price', 'rate', 'purchase rate'] },
  { key: 'wholesale_price', label: 'Wholesale Price (₹)', required: false, aliases: ['wholesale price', 'trade price', 'dealer price', 'wp', 'wholesale'] },
  { key: 'retail_price', label: 'Retail Selling Price (₹)', required: false, aliases: ['retail price', 'sale price', 'selling price', 'mrp', 'sp', 'retail', 'list price'] },
  { key: 'colour', label: 'Colour / Variant', required: false, aliases: ['colour', 'color', 'variant', 'shade'] },
  { key: 'notes', label: 'Batch / Invoice Notes', required: false, aliases: ['notes', 'remarks', 'invoice', 'vendor', 'supplier', 'invoice no'] },
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
  const [loadingLogs, setLoadingLogs] = useState(false);

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

  // Execute Bulk Import to Backend
  const handleExecuteImport = async () => {
    if (!mappedRecords.length) {
      setGlobalToast({ message: 'No valid records to import. Please check your column mappings.', type: 'error' });
      return;
    }

    setImporting(true);
    try {
      const res = await api.post('/inventory/bulk-import', {
        fileName,
        destinationShopId,
        defaultAssignedUserId: defaultAssignedUserId || null,
        records: mappedRecords
      });

      setImportResult(res.summary);
      setStep(4);
      setGlobalToast({ message: `Successfully imported ${res.summary.createdBatches} inventory batches!`, type: 'success' });
      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error('[BulkImport] Execution failed:', err);
      setGlobalToast({ message: err.response?.data?.error || 'Failed to complete inventory import.', type: 'error' });
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

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 p-6 md:p-8 text-white shadow-2xl border border-slate-700/50">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" /> Intelligent Supplier Import Engine
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
              Supplier Excel & CSV Batch Ingestion
            </h1>
            <p className="text-slate-300 text-xs md:text-sm max-w-xl font-medium leading-relaxed">
              Upload supplier spreadsheets in any layout. Automatic fuzzy column detection transforms supplier stock into AS Store structure while preserving FIFO batches and pricing.
            </p>
          </div>

          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs flex items-center gap-2 transition-all backdrop-blur-md shrink-0 shadow-lg"
          >
            <Download className="w-4 h-4 text-emerald-400" /> Download Sample Excel
          </button>
        </div>
      </div>

      {/* Step Wizard Container */}
      <div className="bg-white border border-slate-200/80 rounded-3xl shadow-xl shadow-slate-200/40 p-6 md:p-8">
        
        {/* Wizard Steps Navigation Bar */}
        <div className="grid grid-cols-4 gap-2 pb-6 mb-6 border-b border-slate-100 text-xs font-black uppercase tracking-wider">
          <div className={`p-3 rounded-2xl flex items-center gap-2.5 transition-all ${step >= 1 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-50 text-slate-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step >= 1 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>1</span>
            <span className="hidden sm:inline">Upload Spreadsheet</span>
          </div>

          <div className={`p-3 rounded-2xl flex items-center gap-2.5 transition-all ${step >= 2 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-50 text-slate-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step >= 2 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>2</span>
            <span className="hidden sm:inline">Map Columns</span>
          </div>

          <div className={`p-3 rounded-2xl flex items-center gap-2.5 transition-all ${step >= 3 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-50 text-slate-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step >= 3 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>3</span>
            <span className="hidden sm:inline">Review & Allocate</span>
          </div>

          <div className={`p-3 rounded-2xl flex items-center gap-2.5 transition-all ${step >= 4 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-50 text-slate-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step >= 4 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>4</span>
            <span className="hidden sm:inline">Import Summary</span>
          </div>
        </div>

        {/* STEP 1: Upload File Dropzone */}
        {step === 1 && (
          <div className="space-y-6 text-center py-8">
            <div className="max-w-xl mx-auto border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/40 rounded-3xl p-8 transition-all relative group cursor-pointer">
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileUpload}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
              />
              <div className="w-16 h-16 rounded-3xl bg-emerald-600 text-white flex items-center justify-center mx-auto mb-4 shadow-xl shadow-emerald-600/30 group-hover:scale-110 transition-transform">
                <UploadCloud className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-black text-slate-900">Drag & Drop Supplier Inventory File</h3>
              <p className="text-xs text-slate-500 mt-1 font-medium">Supports Microsoft Excel (.xlsx, .xls) and CSV (.csv) spreadsheets.</p>
              <span className="inline-block mt-4 px-4 py-2 rounded-xl bg-white border border-emerald-200 text-emerald-800 font-extrabold text-xs shadow-sm">
                Browse Files from Device
              </span>
            </div>
          </div>
        )}

        {/* STEP 2: Smart Column Mapper */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900">Intelligent Field Auto-Mapping</h3>
                <p className="text-xs text-slate-500 font-medium">Review and match detected Excel columns to AS Store fields.</p>
              </div>
              <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs">
                File: {fileName} ({rawRows.length} rows)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {TARGET_FIELDS.map((field) => (
                <div key={field.key} className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-800">{field.label}</label>
                    {fieldMapping[field.key] ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase flex items-center gap-1">
                        <Check className="w-3 h-3" /> Auto-Matched
                      </span>
                    ) : field.required ? (
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-black uppercase">
                        Required
                      </span>
                    ) : null}
                  </div>

                  <select
                    value={fieldMapping[field.key] || ''}
                    onChange={(e) => setFieldMapping({ ...fieldMapping, [field.key]: e.target.value })}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Do Not Import / Leave Blank --</option>
                    {rawHeaders.map((header) => (
                      <option key={header} value={header}>
                        Excel Column: "{header}"
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" /> Back to File Upload
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={!fieldMapping.short_name || !fieldMapping.quantity}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 disabled:opacity-50"
              >
                Continue to Review ({mappedRecords.length} Records) <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Preview, Destination Branch & Ownership Settings */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-emerald-50/60 border border-emerald-200">
              <div>
                <h3 className="text-base font-black text-emerald-950">Destination Branch & Allocation</h3>
                <p className="text-xs text-emerald-700 font-medium">Select which retail shop or warehouse will receive these imported inventory batches.</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Shop Selector */}
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-emerald-800 block mb-1">Target Shop / Branch</span>
                  <select
                    value={destinationShopId}
                    onChange={(e) => setDestinationShopId(Number(e.target.value))}
                    className="px-3.5 py-2 bg-white border border-emerald-300 rounded-xl text-xs font-bold text-slate-900 outline-none"
                  >
                    {(data.shops || []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.area ? `(${s.area})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Live Data Transformed Preview Table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider">Live Transformed Data Preview (First 5 Rows)</h4>
                <span className="text-xs font-bold text-slate-600">Total Valid Rows: {mappedRecords.length}</span>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase">
                      <th className="p-3">Product Name</th>
                      <th className="p-3">Brand</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Compatible Models</th>
                      <th className="p-3">Qty</th>
                      <th className="p-3">Cost (₹)</th>
                      <th className="p-3">Retail (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {mappedRecords.slice(0, 5).map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-900">{row.short_name}</td>
                        <td className="p-3">{row.brand}</td>
                        <td className="p-3">{row.category}</td>
                        <td className="p-3 max-w-xs truncate">{row.full_model_list || 'N/A'}</td>
                        <td className="p-3 font-black text-emerald-600">{row.quantity} pcs</td>
                        <td className="p-3 font-bold">₹{row.purchase_price}</td>
                        <td className="p-3 font-bold text-teal-700">₹{row.retail_price}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Mapping
              </button>
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={importing}
                className="px-8 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs flex items-center gap-2 shadow-xl shadow-emerald-600/30 active:scale-95 transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                {importing ? 'Importing Batches into Database...' : `Execute Bulk Import (${mappedRecords.length} Items)`}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Import Summary Results */}
        {step === 4 && importResult && (
          <div className="space-y-6 text-center py-6">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <h3 className="text-2xl font-black text-slate-900">Inventory Import Complete!</h3>
            <p className="text-xs text-slate-500 font-medium">All supplier batches have been successfully saved into FIFO inventory.</p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto pt-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Batches Created</span>
                <span className="text-2xl font-black text-slate-900">{importResult.createdBatches}</span>
              </div>
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                <span className="text-[10px] font-black uppercase text-emerald-600 block mb-1">New Catalog Products</span>
                <span className="text-2xl font-black text-emerald-700">{importResult.createdProducts}</span>
              </div>
              <div className="p-4 rounded-2xl bg-teal-50 border border-teal-100">
                <span className="text-[10px] font-black uppercase text-teal-600 block mb-1">Total Stock Added</span>
                <span className="text-2xl font-black text-teal-700">{importResult.totalQuantityAdded} pcs</span>
              </div>
              <div className="p-4 rounded-2xl bg-cyan-50 border border-cyan-100">
                <span className="text-[10px] font-black uppercase text-cyan-600 block mb-1">Total Inventory Valuation</span>
                <span className="text-2xl font-black text-cyan-700">₹{importResult.totalValuation?.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div className="pt-6">
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setFileName('');
                  setRawRows([]);
                  setImportResult(null);
                }}
                className="px-6 py-3 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-all"
              >
                Import Another Supplier File
              </button>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
