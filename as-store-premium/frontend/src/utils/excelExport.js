import * as XLSX from 'xlsx';

/**
 * Generates current date string formatted as YYYY-MM-DD for clean file naming.
 */
export function getExportDateStr() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Generic Excel exporter utilizing SheetJS.
 * Maps data to structured column headers, auto-calculates sensible column widths, and triggers download.
 *
 * @param {Object} options
 * @param {string} options.filename - File name (e.g. 'Stock_Prices_2026-08-24.xlsx')
 * @param {string} [options.sheetName='Sheet1'] - Sheet name
 * @param {Array<{header: string, key?: string, formatter?: Function, minWidth?: number, maxWidth?: number}>} options.columns - Column configuration
 * @param {Array<Object>} options.data - Rows to export
 */
export function exportToExcel({ filename, sheetName = 'Sheet1', columns = [], data = [] }) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('No data available to export');
  }

  // Format data according to provided column definitions
  const formattedRows = data.map((item) => {
    const row = {};
    columns.forEach((col) => {
      let val = item[col.key];
      if (col.formatter && typeof col.formatter === 'function') {
        val = col.formatter(val, item);
      } else if (val === undefined || val === null) {
        val = '';
      } else if (Array.isArray(val)) {
        val = val.join(', ');
      }
      row[col.header] = val;
    });
    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(formattedRows);

  // Compute sensible column widths dynamically to prevent text truncation
  const colWidths = columns.map((col) => {
    let maxLen = (col.header || '').toString().length;
    formattedRows.forEach((row) => {
      const cellVal = row[col.header];
      if (cellVal !== undefined && cellVal !== null) {
        const strVal = String(cellVal);
        if (strVal.length > maxLen) {
          maxLen = strVal.length;
        }
      }
    });

    const minW = col.minWidth || 14;
    const maxW = col.maxWidth || 55;
    const calculatedWidth = maxLen + 4; // Add padding for readable spacing
    return { wch: Math.min(Math.max(calculatedWidth, minW), maxW) };
  });

  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  const safeSheetName = (sheetName || 'Sheet1').slice(0, 31);
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);

  const cleanFileName = filename.toLowerCase().endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(workbook, cleanFileName);
}

/**
 * Export handler for Stock Prices (/prices) page.
 * Required columns:
 * - Item/Model Name
 * - Quality/Tag
 * - Category
 * - Mfg Brand
 * - Compatible Models
 * - Combined Stock
 * - Cost Price
 * - Wholesale Price
 * - Sale Price
 */
export function exportStockPricesExcel(items = [], filename = null) {
  const dateStr = getExportDateStr();
  const outputFilename = filename || `Stock_Prices_${dateStr}.xlsx`;

  const columns = [
    {
      header: 'Item/Model Name',
      key: 'name',
      minWidth: 26,
      formatter: (_val, row) => row.short_name || row.name || row.model || 'Product'
    },
    {
      header: 'Quality/Tag',
      key: 'quality_variant',
      minWidth: 16,
      formatter: (_val, row) => row.quality_variant || row.product_variant_name || row.quality || row.tag || 'Standard'
    },
    {
      header: 'Category',
      key: 'category',
      minWidth: 18,
      formatter: (_val, row) => row.part_category || row.category || row.part_category_name || 'Display'
    },
    {
      header: 'Mfg Brand',
      key: 'manufacturing_brand_name',
      minWidth: 18,
      formatter: (_val, row) => row.manufacturing_brand_name || row.manufacturing_brand || row.mfg_brand || row.brand || row.company_brand_name || 'Generic'
    },
    {
      header: 'Compatible Models',
      key: 'full_model_list',
      minWidth: 32,
      maxWidth: 65,
      formatter: (_val, row) => row.full_model_list || row.compatible_models || row.model || ''
    },
    {
      header: 'Combined Stock',
      key: 'quantity',
      minWidth: 16,
      formatter: (_val, row) => {
        const qty = row.quantity ?? row.available_stock ?? row.stock_quantity ?? row.total_stock ?? row.warehouse_stock ?? row.stock ?? 0;
        return Number(qty) || 0;
      }
    },
    {
      header: 'Cost Price',
      key: 'cost_price',
      minWidth: 14,
      formatter: (_val, row) => {
        const cost = row.avg_cost_price ?? row.purchase_price ?? row.cost_price ?? 0;
        return Number(cost) || 0;
      }
    },
    {
      header: 'Wholesale Price',
      key: 'wholesale_price',
      minWidth: 16,
      formatter: (_val, row) => Number(row.wholesale_price ?? 0) || 0
    },
    {
      header: 'Sale Price',
      key: 'sale_price',
      minWidth: 14,
      formatter: (_val, row) => Number(row.sale_price ?? row.retail_price ?? 0) || 0
    }
  ];

  exportToExcel({
    filename: outputFilename,
    sheetName: 'Stock Prices',
    columns,
    data: items
  });
}

/**
 * Export handler for Current Stock (/stock page).
 */
export function exportCurrentStockExcel(items = [], filename = null) {
  const dateStr = getExportDateStr();
  const outputFilename = filename || `Current_Stock_${dateStr}.xlsx`;

  const columns = [
    {
      header: 'Product Name',
      key: 'product_name',
      minWidth: 26,
      formatter: (_val, row) => row.product_name || row.short_name || row.name || 'Product'
    },
    {
      header: 'Model Name',
      key: 'model_name',
      minWidth: 24,
      formatter: (_val, row) => row.model_name || row.full_model_list || row.model || ''
    },
    {
      header: 'Brand',
      key: 'brand',
      minWidth: 16,
      formatter: (_val, row) => row.brand || row.company_brand_name || ''
    },
    {
      header: 'Category',
      key: 'category',
      minWidth: 18,
      formatter: (_val, row) => row.category || row.part_category || ''
    },
    {
      header: 'Colour',
      key: 'colour',
      minWidth: 16,
      formatter: (_val, row) => Array.isArray(row.colours) ? row.colours.join(', ') : (row.colour || row.colours || 'Standard')
    },
    {
      header: 'Quantity',
      key: 'quantity',
      minWidth: 14,
      formatter: (_val, row) => Number(row.quantity ?? row.quantity_remaining ?? 0) || 0
    },
    {
      header: 'Cost Price',
      key: 'purchase_price',
      minWidth: 14,
      formatter: (_val, row) => Number(row.purchase_price ?? row.avg_cost_price ?? 0) || 0
    },
    {
      header: 'Wholesale Price',
      key: 'wholesale_price',
      minWidth: 16,
      formatter: (_val, row) => Number(row.wholesale_price ?? 0) || 0
    },
    {
      header: 'Sale Price',
      key: 'sale_price',
      minWidth: 14,
      formatter: (_val, row) => Number(row.sale_price ?? 0) || 0
    },
    {
      header: 'Shop / Location',
      key: 'shop_name',
      minWidth: 20,
      formatter: (_val, row) => row.shop_name || row.shopkeeper_name || 'Main Warehouse'
    },
    {
      header: 'Date Added',
      key: 'date_added',
      minWidth: 16,
      formatter: (_val, row) => row.date_added ? String(row.date_added).slice(0, 10) : (row.updated_at ? String(row.updated_at).slice(0, 10) : '')
    },
    {
      header: 'Stock Status',
      key: 'stock_status',
      minWidth: 16,
      formatter: (_val, row) => {
        if (row.stock_status) return row.stock_status;
        const q = Number(row.quantity ?? row.quantity_remaining ?? 0);
        return q === 0 ? 'Out of Stock' : q <= 3 ? 'Low Stock' : 'In Stock';
      }
    }
  ];

  exportToExcel({
    filename: outputFilename,
    sheetName: 'Current Stock',
    columns,
    data: items
  });
}

/**
 * Export handler for Product Catalog (/stock page).
 */
export function exportProductCatalogExcel(items = [], filename = null) {
  const dateStr = getExportDateStr();
  const outputFilename = filename || `Product_Catalog_${dateStr}.xlsx`;

  const columns = [
    {
      header: 'Product Name',
      key: 'short_name',
      minWidth: 26,
      formatter: (_val, row) => row.short_name || row.name || 'Product'
    },
    {
      header: 'Compatible Models',
      key: 'full_model_list',
      minWidth: 32,
      maxWidth: 65,
      formatter: (_val, row) => row.full_model_list || row.compatible_models || row.model || ''
    },
    {
      header: 'Brand',
      key: 'brand',
      minWidth: 16,
      formatter: (_val, row) => row.brand || row.company_brand_name || ''
    },
    {
      header: 'Mfg Brand',
      key: 'manufacturing_brand_name',
      minWidth: 18,
      formatter: (_val, row) => row.manufacturing_brand_name || row.manufacturing_brand || row.mfg_brand || ''
    },
    {
      header: 'Category',
      key: 'category',
      minWidth: 18,
      formatter: (_val, row) => row.part_category || row.category || row.part_category_name || ''
    },
    {
      header: 'Quality / Variant',
      key: 'quality_variant',
      minWidth: 18,
      formatter: (_val, row) => row.quality_variant || row.product_variant_name || row.quality || ''
    },
    {
      header: 'Colours',
      key: 'colours',
      minWidth: 18,
      formatter: (_val, row) => Array.isArray(row.colours) ? row.colours.join(', ') : (row.colours || row.colour || '')
    },
    {
      header: 'Cost Price',
      key: 'purchase_price',
      minWidth: 14,
      formatter: (_val, row) => Number(row.purchase_price ?? row.avg_cost_price ?? 0) || 0
    },
    {
      header: 'Wholesale Price',
      key: 'wholesale_price',
      minWidth: 16,
      formatter: (_val, row) => Number(row.wholesale_price ?? 0) || 0
    },
    {
      header: 'Sale Price',
      key: 'sale_price',
      minWidth: 14,
      formatter: (_val, row) => Number(row.sale_price ?? row.retail_price ?? 0) || 0
    }
  ];

  exportToExcel({
    filename: outputFilename,
    sheetName: 'Product Catalog',
    columns,
    data: items
  });
}

/**
 * Export handler for Product Brands (/brands page).
 * Multi-Sheet Excel:
 * - Sheet 1 (All Products): Full itemized product list with all flattened fields
 * - Sheet 2 (Brand Summary): High-level brand summary table (Brand Name, Product Models Count, Total Units, Total Valuation)
 */
export function exportBrandProductsInventoryExcel({ brandSummaries = [], products = [], filename = null } = {}) {
  const dateStr = getExportDateStr();
  const outputFilename = filename || `Brand_Products_Inventory_${dateStr}.xlsx`;

  // Collect itemized products list.
  let itemizedProducts = [];
  if (Array.isArray(products) && products.length > 0) {
    itemizedProducts = [...products];
  } else if (Array.isArray(brandSummaries)) {
    brandSummaries.forEach((b) => {
      if (Array.isArray(b.products) && b.products.length > 0) {
        b.products.forEach((p) => {
          itemizedProducts.push({
            ...p,
            brand: p.brand || b.name || b.rawName || 'Generic'
          });
        });
      }
    });
  }

  // Deduplicate products by ID / key while preserving data
  const seenProductIds = new Set();
  const uniqueProducts = [];
  itemizedProducts.forEach((p) => {
    const key = p.product_id || p.id || `${p.brand}_${p.name}_${p.model}`;
    if (!seenProductIds.has(key)) {
      seenProductIds.add(key);
      uniqueProducts.push(p);
    }
  });

  // Sort by Brand alphabetically, then by Display Name
  uniqueProducts.sort((a, b) => {
    const brandA = String(a.brand || a.company_brand_name || '').toLowerCase();
    const brandB = String(b.brand || b.company_brand_name || '').toLowerCase();
    if (brandA !== brandB) return brandA.localeCompare(brandB);
    const nameA = String(a.short_name || a.name || a.product_name || '').toLowerCase();
    const nameB = String(b.short_name || b.name || b.product_name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  // Sheet 1: Itemized Product Inventory Columns
  const productColumns = [
    {
      header: 'Brand',
      key: 'brand',
      minWidth: 20,
      formatter: (_val, row) => row.brand || row.company_brand_name || 'Generic'
    },
    {
      header: 'Display Name',
      key: 'name',
      minWidth: 32,
      formatter: (_val, row) => row.short_name || row.name || row.product_name || 'Product'
    },
    {
      header: 'Compatible Models',
      key: 'full_model_list',
      minWidth: 32,
      maxWidth: 70,
      formatter: (_val, row) => row.full_model_list || row.compatible_models || row.model || ''
    },
    {
      header: 'Part Category',
      key: 'part_category',
      minWidth: 20,
      formatter: (_val, row) => row.part_category || row.category || row.part_category_name || 'Display'
    },
    {
      header: 'Quality / Variant',
      key: 'quality_variant',
      minWidth: 20,
      formatter: (_val, row) => row.quality_variant || row.product_variant_name || row.quality || 'Standard'
    },
    {
      header: 'Manufacturing Brand',
      key: 'manufacturing_brand_name',
      minWidth: 22,
      formatter: (_val, row) => row.manufacturing_brand_name || row.manufacturing_brand || row.mfg_brand || ''
    },
    {
      header: 'Supplier',
      key: 'supplier_name',
      minWidth: 22,
      formatter: (_val, row) => row.supplier_name || (row.supplier_id ? `Supplier #${row.supplier_id}` : 'Direct Stock')
    },
    {
      header: 'Purchase Price (Cost ₹)',
      key: 'purchase_price',
      minWidth: 22,
      formatter: (_val, row) => Number(row.purchase_price ?? row.avg_cost_price ?? row.cost_price ?? 0) || 0
    },
    {
      header: 'Wholesale Price (₹)',
      key: 'wholesale_price',
      minWidth: 20,
      formatter: (_val, row) => Number(row.wholesale_price ?? 0) || 0
    },
    {
      header: 'Selling Price (Retail ₹)',
      key: 'sale_price',
      minWidth: 22,
      formatter: (_val, row) => Number(row.sale_price ?? row.retail_price ?? 0) || 0
    },
    {
      header: 'Total Available Stock (pcs)',
      key: 'quantity',
      minWidth: 24,
      formatter: (_val, row) => Number(row.available_stock ?? row.total_stock ?? row.quantity ?? row.stock_quantity ?? row.stock ?? 0) || 0
    },
    {
      header: 'Color-wise Stock Breakdown',
      key: 'colour_stock',
      minWidth: 32,
      maxWidth: 60,
      formatter: (_val, row) => {
        if (row.colour_stock && typeof row.colour_stock === 'object' && Object.keys(row.colour_stock).length > 0) {
          return Object.entries(row.colour_stock)
            .map(([col, qty]) => `${col}: ${qty}`)
            .join(', ');
        }
        if (Array.isArray(row.colours) && row.colours.length > 0) {
          return row.colours.join(', ');
        }
        if (row.colour || row.colours) {
          return String(row.colour || row.colours);
        }
        return 'Standard';
      }
    },
    {
      header: 'Stock Status',
      key: 'stock_status',
      minWidth: 16,
      formatter: (_val, row) => {
        const qty = Number(row.available_stock ?? row.total_stock ?? row.quantity ?? row.stock_quantity ?? row.stock ?? 0);
        if (qty === 0) return 'No Stock';
        if (qty <= 3) return 'Low Stock';
        return 'In Stock';
      }
    },
    {
      header: 'Description / Notes',
      key: 'description',
      minWidth: 30,
      maxWidth: 65,
      formatter: (_val, row) => row.description || row.notes || ''
    }
  ];

  // Sheet 2: Brand Summary Columns
  const summaryColumns = [
    {
      header: 'Brand Name',
      key: 'name',
      minWidth: 24,
      formatter: (_val, row) => row.name || row.rawName || row.brand || 'Generic'
    },
    {
      header: 'Product Models Count',
      key: 'productCount',
      minWidth: 22,
      formatter: (_val, row) => {
        const count = row.productCount !== undefined 
          ? row.productCount 
          : (Array.isArray(row.products) ? row.products.length : 0);
        return Number(count) || 0;
      }
    },
    {
      header: 'Total Available Stock (units)',
      key: 'totalStock',
      minWidth: 26,
      formatter: (_val, row) => Number(row.totalStock ?? row.quantity ?? 0) || 0
    },
    {
      header: 'Total Valuation (₹)',
      key: 'stockValue',
      minWidth: 22,
      formatter: (_val, row) => Number(row.stockValue ?? 0) || 0
    }
  ];

  // Helper to build worksheet with formatted rows and dynamic column widths
  const createWorksheet = (data, cols) => {
    const formattedRows = data.map((item) => {
      const row = {};
      cols.forEach((col) => {
        let val = item[col.key];
        if (col.formatter && typeof col.formatter === 'function') {
          val = col.formatter(val, item);
        } else if (val === undefined || val === null) {
          val = '';
        } else if (Array.isArray(val)) {
          val = val.join(', ');
        }
        row[col.header] = val;
      });
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(formattedRows);

    const colWidths = cols.map((col) => {
      let maxLen = (col.header || '').toString().length;
      formattedRows.forEach((row) => {
        const cellVal = row[col.header];
        if (cellVal !== undefined && cellVal !== null) {
          const strVal = String(cellVal);
          if (strVal.length > maxLen) {
            maxLen = strVal.length;
          }
        }
      });
      const minW = col.minWidth || 14;
      const maxW = col.maxWidth || 65;
      const calculatedWidth = maxLen + 4;
      return { wch: Math.min(Math.max(calculatedWidth, minW), maxW) };
    });

    worksheet['!cols'] = colWidths;
    return worksheet;
  };

  const workbook = XLSX.utils.book_new();

  // 1. Sheet 1: All Products
  const sheet1 = createWorksheet(uniqueProducts, productColumns);
  XLSX.utils.book_append_sheet(workbook, sheet1, 'All Products');

  // 2. Sheet 2: Brand Summary
  const sheet2 = createWorksheet(brandSummaries, summaryColumns);
  XLSX.utils.book_append_sheet(workbook, sheet2, 'Brand Summary');

  const cleanFileName = outputFilename.toLowerCase().endsWith('.xlsx') ? outputFilename : `${outputFilename}.xlsx`;
  XLSX.writeFile(workbook, cleanFileName);
}

// Alias for backwards compatibility
export const exportProductBrandsExcel = (itemsOrOptions, filename = null) => {
  if (Array.isArray(itemsOrOptions)) {
    return exportBrandProductsInventoryExcel({ brandSummaries: itemsOrOptions, filename });
  }
  return exportBrandProductsInventoryExcel(itemsOrOptions);
};

/**
 * Export handler for Manufacturing Brands (/manufacturing-brands page).
 * Columns:
 * - Manufacturing Brand Name
 * - Product Models Count
 * - Stock Available (units)
 * - Valuation (₹)
 */
export function exportManufacturingBrandsExcel(items = [], filename = null) {
  const dateStr = getExportDateStr();
  const outputFilename = filename || `Manufacturing_Brands_${dateStr}.xlsx`;

  const columns = [
    {
      header: 'Manufacturing Brand Name',
      key: 'name',
      minWidth: 28,
      formatter: (_val, row) => row.name || row.rawName || 'Unknown'
    },
    {
      header: 'Product Models Count',
      key: 'productCount',
      minWidth: 22,
      formatter: (_val, row) => {
        const count = row.productCount !== undefined 
          ? row.productCount 
          : (Array.isArray(row.products) ? row.products.length : 0);
        return Number(count) || 0;
      }
    },
    {
      header: 'Stock Available (units)',
      key: 'totalStock',
      minWidth: 24,
      formatter: (_val, row) => Number(row.totalStock ?? row.quantity ?? 0) || 0
    },
    {
      header: 'Valuation (₹)',
      key: 'stockValue',
      minWidth: 20,
      formatter: (_val, row) => Number(row.stockValue ?? 0) || 0
    },
    {
      header: 'Status',
      key: 'is_active',
      minWidth: 14,
      formatter: (_val, row) => (row.is_active !== false ? 'Active' : 'Inactive')
    }
  ];

  exportToExcel({
    filename: outputFilename,
    sheetName: 'Mfg Brands',
    columns,
    data: items
  });
}

/**
 * Export handler for Suppliers (/suppliers page).
 * Columns:
 * - Supplier Name / Company
 * - Contact Person / Phone / Email
 * - Total Orders / Linked Products
 * - Outstanding Balance / Valuation
 */
export function exportSuppliersExcel(items = [], filename = null) {
  const dateStr = getExportDateStr();
  const outputFilename = filename || `Suppliers_List_${dateStr}.xlsx`;

  const columns = [
    {
      header: 'Supplier Name / Company',
      key: 'name',
      minWidth: 28,
      formatter: (_val, row) => row.name || row.rawName || row.company || 'Unknown'
    },
    {
      header: 'Contact Person / Phone / Email',
      key: 'contact',
      minWidth: 30,
      formatter: (_val, row) => {
        const parts = [row.contact_person, row.phone || row.mobile, row.email].filter(Boolean);
        return parts.length > 0 ? parts.join(' | ') : 'N/A';
      }
    },
    {
      header: 'Total Orders / Linked Products',
      key: 'linked_products',
      minWidth: 28,
      formatter: (_val, row) => {
        const count = row.linked_products_count ?? (Array.isArray(row.products) ? row.products.length : (row.total_orders ?? 0));
        return Number(count) || 0;
      }
    },
    {
      header: 'Outstanding Balance / Valuation',
      key: 'valuation',
      minWidth: 28,
      formatter: (_val, row) => {
        const val = row.outstanding_balance ?? row.stockValue ?? row.valuation ?? 0;
        return Number(val) || 0;
      }
    },
    {
      header: 'Status',
      key: 'is_active',
      minWidth: 14,
      formatter: (_val, row) => (row.is_active !== false ? 'Active' : 'Inactive')
    }
  ];

  exportToExcel({
    filename: outputFilename,
    sheetName: 'Suppliers Registry',
    columns,
    data: items
  });
}

/**
 * Export handler for Low & Out of Stock Alerts (/low-stock page).
 * Downloadable reorder spreadsheet (.xlsx).
 */
export function exportLowStockExcel(items = [], filename = null) {
  const dateStr = getExportDateStr();
  const outputFilename = filename || `Low_Stock_Inventory_${dateStr}.xlsx`;

  const columns = [
    {
      header: 'Brand',
      key: 'brand',
      minWidth: 18,
      formatter: (_val, row) => row.brand || row.company_brand_name || 'Generic'
    },
    {
      header: 'Product / Model Name',
      key: 'name',
      minWidth: 32,
      formatter: (_val, row) => row.short_name || row.name || row.product_name || 'Product'
    },
    {
      header: 'Compatible Models',
      key: 'full_model_list',
      minWidth: 30,
      maxWidth: 70,
      formatter: (_val, row) => row.full_model_list || row.compatible_models || row.model || ''
    },
    {
      header: 'Part Category',
      key: 'part_category',
      minWidth: 18,
      formatter: (_val, row) => row.part_category || row.category || row.part_category_name || 'Display'
    },
    {
      header: 'Quality / Variant',
      key: 'quality_variant',
      minWidth: 20,
      formatter: (_val, row) => row.quality_variant || row.product_variant_name || row.quality || 'Standard'
    },
    {
      header: 'Manufacturing Brand',
      key: 'manufacturing_brand_name',
      minWidth: 22,
      formatter: (_val, row) => row.manufacturing_brand_name || row.manufacturing_brand || row.mfg_brand || ''
    },
    {
      header: 'Current Stock (pcs)',
      key: 'quantity',
      minWidth: 20,
      formatter: (_val, row) => Number(row.available_stock ?? row.total_stock ?? row.quantity ?? row.stock_quantity ?? row.stock ?? 0) || 0
    },
    {
      header: 'Stock Status',
      key: 'stock_status',
      minWidth: 18,
      formatter: (_val, row) => {
        const qty = Number(row.available_stock ?? row.total_stock ?? row.quantity ?? row.stock_quantity ?? row.stock ?? 0);
        return qty === 0 ? 'Out of Stock (0 pcs)' : `Low Stock (${qty} pcs)`;
      }
    },
    {
      header: 'Color-wise Breakdown',
      key: 'colour_stock',
      minWidth: 28,
      maxWidth: 60,
      formatter: (_val, row) => {
        if (row.colour_stock && typeof row.colour_stock === 'object' && Object.keys(row.colour_stock).length > 0) {
          return Object.entries(row.colour_stock)
            .map(([col, qty]) => `${col}: ${qty}`)
            .join(', ');
        }
        if (Array.isArray(row.colours) && row.colours.length > 0) {
          return row.colours.join(', ');
        }
        if (row.colour || row.colours) {
          return String(row.colour || row.colours);
        }
        return 'Standard';
      }
    },
    {
      header: 'Supplier Name',
      key: 'supplier_name',
      minWidth: 22,
      formatter: (_val, row) => row.supplier_name || (row.supplier_id ? `Supplier #${row.supplier_id}` : 'Unassigned')
    },
    {
      header: 'Purchase Price (Cost ₹)',
      key: 'purchase_price',
      minWidth: 22,
      formatter: (_val, row) => Number(row.purchase_price ?? row.avg_cost_price ?? row.cost_price ?? 0) || 0
    },
    {
      header: 'Wholesale Price (₹)',
      key: 'wholesale_price',
      minWidth: 20,
      formatter: (_val, row) => Number(row.wholesale_price ?? 0) || 0
    },
    {
      header: 'Selling Price (Retail ₹)',
      key: 'sale_price',
      minWidth: 22,
      formatter: (_val, row) => Number(row.sale_price ?? row.retail_price ?? 0) || 0
    }
  ];

  exportToExcel({
    filename: outputFilename,
    sheetName: 'Low Stock Reorder List',
    columns,
    data: items
  });
}

