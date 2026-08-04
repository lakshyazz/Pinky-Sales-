import handler from '../../../api/index.js';

async function testLocalHandler() {
  console.log('Testing api/index.js handler locally...');
  const req = {
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'content-type': 'application/json' },
    body: { username: 'superadmin', password: 'superadmin123' },
  };

  const res = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    disable() {},
    status(code) { this.statusCode = code; return this; },
    json(data) {
      console.log('Handler returned status:', this.statusCode);
      console.log('Handler returned json payload:', data);
    },
  };

  try {
    await handler(req, res);
  } catch (err) {
    console.error('Handler threw error:', err);
  }
  process.exit(0);
}

testLocalHandler();
