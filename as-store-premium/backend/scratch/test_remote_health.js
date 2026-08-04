async function testHealth() {
  const domains = [
    'https://pinkysales.vercel.app',
    'https://pinky-sales.vercel.app',
    'https://pinkysales-main.vercel.app',
  ];

  for (const domain of domains) {
    try {
      console.log('\n--- Testing Domain:', domain);
      const res = await fetch(`${domain}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'superadmin', password: 'superadmin123' })
      });
      const text = await res.text();
      console.log('Status:', res.status);
      console.log('Response body:', text);
    } catch (err) {
      console.error('Fetch error:', err.message);
    }
  }
}

testHealth();
