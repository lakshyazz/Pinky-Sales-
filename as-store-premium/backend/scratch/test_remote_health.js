async function testLogin() {
  const url = 'https://pinkysales.vercel.app/api/auth/login';
  try {
    console.log('\n--- Fetching:', url);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'superadmin', password: 'superadmin123' })
    });
    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Response body:', text);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

testLogin();
