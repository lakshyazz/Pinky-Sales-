import XLSX from './frontend/node_modules/xlsx/xlsx.js';
import path from 'path';
import fs from 'fs';

const sampleData = [
  {
    'Particulars / Goods': 'iPhone 15 Pro Max 11D Premium Curved Tempered Glass',
    'Make / Brand': 'Apple',
    'Category Dept': 'Tempered Glass',
    'Fits Device Models': 'iPhone 15 Pro Max, A3106',
    'Stock Pcs': 100,
    'Supplier Cost Rate (₹)': 85,
    'Trade Wholesale Rate (₹)': 140,
    'Retail Selling Rate (₹)': 250,
    'Shade / Variant': 'Clear HD',
    'Invoice Reference': 'Vendor Invoice #SUP-2026-991'
  },
  {
    'Particulars / Goods': 'Samsung S24 Ultra 5G Original Battery Pack 5000mAh',
    'Make / Brand': 'Samsung',
    'Category Dept': 'Battery',
    'Fits Device Models': 'Galaxy S24 Ultra, SM-S928B',
    'Stock Pcs': 40,
    'Supplier Cost Rate (₹)': 780,
    'Trade Wholesale Rate (₹)': 1050,
    'Retail Selling Rate (₹)': 1450,
    'Shade / Variant': 'Original',
    'Invoice Reference': 'Vendor Invoice #SUP-2026-991'
  },
  {
    'Particulars / Goods': 'OnePlus 12 5G Curved Super AMOLED Display Assembly',
    'Make / Brand': 'OnePlus',
    'Category Dept': 'Display',
    'Fits Device Models': 'OnePlus 12, CPH2573',
    'Stock Pcs': 15,
    'Supplier Cost Rate (₹)': 4800,
    'Trade Wholesale Rate (₹)': 5600,
    'Retail Selling Rate (₹)': 6800,
    'Shade / Variant': 'Black Frame',
    'Invoice Reference': 'Vendor Invoice #SUP-2026-991'
  },
  {
    'Particulars / Goods': 'Xiaomi 120W HyperCharge GaN Power Adapter with Type-C Cable',
    'Make / Brand': 'Xiaomi',
    'Category Dept': 'Charger',
    'Fits Device Models': 'Xiaomi 13 Pro, Redmi Note 13 Pro+, Poco F6',
    'Stock Pcs': 60,
    'Supplier Cost Rate (₹)': 420,
    'Trade Wholesale Rate (₹)': 650,
    'Retail Selling Rate (₹)': 890,
    'Shade / Variant': 'White',
    'Invoice Reference': 'Vendor Invoice #SUP-2026-991'
  },
  {
    'Particulars / Goods': 'Realme 12 Pro+ 5G Camera Lens Glass Protector',
    'Make / Brand': 'Realme',
    'Category Dept': 'Camera Protector',
    'Fits Device Models': 'Realme 12 Pro+, RMX3840',
    'Stock Pcs': 150,
    'Supplier Cost Rate (₹)': 25,
    'Trade Wholesale Rate (₹)': 45,
    'Retail Selling Rate (₹)': 99,
    'Shade / Variant': 'Titanium Gold',
    'Invoice Reference': 'Vendor Invoice #SUP-2026-991'
  }
];

const worksheet = XLSX.utils.json_to_sheet(sampleData);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Supplier Inventory');

const outputPath = path.resolve(process.cwd(), 'sample_supplier_inventory.xlsx');
XLSX.writeFile(workbook, outputPath);
console.log(`[SampleExcel] Successfully created Excel spreadsheet: ${outputPath}`);
