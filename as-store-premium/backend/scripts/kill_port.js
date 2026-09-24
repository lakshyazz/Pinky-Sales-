import { execSync } from 'child_process';

try {
  const output = execSync('netstat -ano').toString();
  const lines = output.split('\n');
  const pids = new Set();
  for (const line of lines) {
    if (line.includes(':5000 ') && line.includes('LISTENING')) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0' && !isNaN(Number(pid))) {
        pids.add(pid);
      }
    }
  }
  console.log('Found PIDs on port 5000:', Array.from(pids));
  for (const pid of pids) {
    if (pid !== String(process.pid)) {
      try {
        execSync(`taskkill /F /PID ${pid}`);
        console.log(`Killed PID ${pid}`);
      } catch (e) {
        console.error(`Failed to kill PID ${pid}:`, e.message);
      }
    }
  }
} catch (err) {
  console.error('Error finding/killing port 5000:', err.message);
}
