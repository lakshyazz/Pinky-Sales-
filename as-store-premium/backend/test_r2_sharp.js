import sharp from 'sharp';
import { optimizeImageBuffer, extractKeyFromUrl, uploadImageToR2, deleteImageFromR2, isR2Configured } from './r2Storage.js';

async function runTests() {
  console.log('--- Starting Cloudflare R2 & Sharp Optimization Tests ---');

  // Test 1: Generate a high-res sample image with Sharp
  console.log('\n[Test 1] Creating a 2000x1500 raw test image...');
  const sampleImageBuffer = await sharp({
    create: {
      width: 2000,
      height: 1500,
      channels: 4,
      background: { r: 13, g: 148, b: 136, alpha: 1 }
    }
  }).png().toBuffer();
  console.log(`Original raw PNG size: ${Math.round(sampleImageBuffer.length / 1024)} KB (2000x1500 px)`);

  // Test 2: Run optimizeImageBuffer
  console.log('\n[Test 2] Running optimizeImageBuffer (target <= 800x800, WebP, 80% quality)...');
  const optimized = await optimizeImageBuffer(sampleImageBuffer);
  console.log(`Optimized WebP size: ${Math.round(optimized.optimizedSize / 1024)} KB (${optimized.width}x${optimized.height} px, format: ${optimized.format})`);
  
  if (optimized.width > 800 || optimized.height > 800) {
    throw new Error(`Dimensions exceed 800px: ${optimized.width}x${optimized.height}`);
  }
  if (optimized.format !== 'webp') {
    throw new Error(`Format is not webp: ${optimized.format}`);
  }
  console.log('✓ Image optimization verified: converted to WebP with max 800x800 bounds.');

  // Test 3: Test URL key extraction
  console.log('\n[Test 3] Testing URL key extraction...');
  const testUrl1 = 'https://pub-abcdef123456.r2.dev/products/1723680000000_abcd1234.webp';
  const key1 = extractKeyFromUrl(testUrl1);
  console.log(`Extracted key from public URL: "${key1}"`);
  if (key1 !== 'products/1723680000000_abcd1234.webp') {
    throw new Error(`Unexpected extracted key: ${key1}`);
  }

  const testUrl2 = 'products/1723680000000_abcd1234.webp';
  const key2 = extractKeyFromUrl(testUrl2);
  if (key2 !== 'products/1723680000000_abcd1234.webp') {
    throw new Error(`Unexpected extracted key: ${key2}`);
  }
  console.log('✓ URL key extraction verified.');

  // Test 4: Test upload handler (fallback / active)
  console.log('\n[Test 4] Testing uploadImageToR2...');
  console.log(`Is R2 currently configured in env: ${isR2Configured()}`);
  const uploadResult = await uploadImageToR2(sampleImageBuffer, 'test_display.png', 'products');
  console.log('Upload result:', {
    success: uploadResult.success,
    key: uploadResult.key,
    size: uploadResult.size,
    fallback: uploadResult.fallback,
    urlPreview: uploadResult.url?.slice(0, 60) + '...'
  });
  if (!uploadResult.success || !uploadResult.url) {
    throw new Error('Upload result failed');
  }
  console.log('✓ Upload flow verified.');

  // Test 5: Test delete handler
  console.log('\n[Test 5] Testing deleteImageFromR2...');
  const deleteResult = await deleteImageFromR2(uploadResult.url);
  console.log('Delete result:', deleteResult);
  if (!deleteResult.success) {
    throw new Error('Delete result failed');
  }
  console.log('✓ Delete flow verified.');

  console.log('\n========================================');
  console.log('  ALL R2 STORAGE & OPTIMIZATION TESTS PASSED!  ');
  console.log('========================================');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
