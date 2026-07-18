const fs = require('fs');
const file = 'c:/Users/laksh/Downloads/pinky-sales-main/as-store-premium/frontend/src/App.jsx';
let text = fs.readFileSync(file, 'utf8');

text = text.replace(
  /<motion\.div\s+variants=\{listVariants\}\s+initial="hidden"\s+whileInView="visible"\s+viewport=\{\{ once: true, margin: "-10px" \}\}\s+className="payment-list"/g,
  '<motion.div \n                  variants={listVariants}\n                  initial="hidden"\n                  animate="visible"\n                  className="payment-list"'
);

fs.writeFileSync(file, text);
