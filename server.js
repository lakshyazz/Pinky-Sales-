// Root Entry Point for Render / Cloud Deployment
const path = require('path');
process.chdir(path.join(__dirname, 'as-store-premium', 'backend'));
require('./as-store-premium/backend/server.js');
