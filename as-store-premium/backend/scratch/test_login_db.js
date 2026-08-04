import bcrypt from 'bcryptjs';
import { getRecord } from '../database.js';

async function testLogin() {
  console.log('Testing DB query for superadmin...');
  try {
    const user = await getRecord(`
      SELECT u.id, u.username, u.password, u.role, u.name, u.shop_id, s.name AS shop_name, s.area AS shop_area
      FROM users u
      LEFT JOIN shops s ON s.id = u.shop_id
      WHERE LOWER(TRIM(u.username)) = LOWER(TRIM(?))
    `, ['superadmin']);
    console.log('User record:', user);

    if (user) {
      const match1 = await bcrypt.compare('superadmin123', user.password);
      console.log('Password match with superadmin123:', match1);
      const match2 = await bcrypt.compare('admin123', user.password);
      console.log('Password match with admin123:', match2);
    }
  } catch (err) {
    console.error('Login error:', err);
  }
  process.exit(0);
}

testLogin();
