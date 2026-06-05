const express = require('express');
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');

const app = express();
const PORT = 3010;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

app.get('/resolve', async (req, res) => {
  const jobUrl = req.query.url;
  if (!jobUrl) {
    return res.status(400).json({ error: 'Missing URL parameter' });
  }

  console.log(`[RESOLVER] Resolving: ${jobUrl}`);
  let browser;
  let chromeProcess;
  try {
    const port = await getFreePort();
    const executablePath = chromium.executablePath();
    console.log(`[RESOLVER] Spawning standalone Chromium on port ${port}...`);

    chromeProcess = spawn(executablePath, [
      '--headless=new',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      `--remote-debugging-port=${port}`
    ], {
      stdio: 'ignore',
      detached: true
    });
    chromeProcess.unref();

    // Poll to make sure the debugging port is active
    let connected = false;
    for (let i = 0; i < 15; i++) {
      const isReady = await new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${port}/json/version`, { timeout: 500 }, (res) => resolve(res.statusCode === 200));
        req.on('error', () => resolve(false));
      });
      if (isReady) {
        connected = true;
        break;
      }
      await new Promise(r => setTimeout(r, 500));
    }

    if (!connected) {
      throw new Error(`Could not start standalone Chromium process on port ${port}`);
    }

    console.log(`[RESOLVER] Connecting to Chromium via CDP on port ${port}...`);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Wait for page content to stabilize
    const html = await page.content();
    const currentUrl = page.url();
    const pageTitle = await page.title().catch(() => 'Unknown');
    console.log(`[RESOLVER] Loaded: "${pageTitle}" at ${currentUrl}`);

    // Detect job status from HTML markers
    const isOffsite = html.includes('apply-link-offsite') || html.includes('offsite-apply-icon');
    const isOnsite = html.includes('apply-link-onsite');
    const isExpired = html.includes('no longer accepting') || html.includes('No longer accepting');

    console.log(`[RESOLVER] Detection: onsite=${isOnsite}, offsite=${isOffsite}, expired=${isExpired}`);

    if (isExpired) {
      console.log('[RESOLVER] Job is expired/closed.');
      return res.json({ success: true, applyUrl: null, applyMethod: 'expired' });
    }

    if (isOnsite) {
      console.log('[RESOLVER] Easy Apply (onsite) detected.');
      return res.json({ success: true, applyUrl: jobUrl, applyMethod: 'onsite' });
    }

    if (isOffsite) {
      // LinkedIn hides the external URL behind a login wall on guest pages.
      // We cannot extract it without authentication.
      console.log('[RESOLVER] Offsite apply detected. External URL not available on guest page.');
      return res.json({ success: true, applyUrl: null, applyMethod: 'offsite' });
    }

    // Fallback: no apply button found at all
    console.log('[RESOLVER] No apply method detected.');
    res.json({ success: true, applyUrl: null, applyMethod: 'unknown' });

  } catch (error) {
    console.error(`[RESOLVER] Error: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (chromeProcess) {
      try {
        process.kill(-chromeProcess.pid); // Kill process group if detached
      } catch (e) {
        chromeProcess.kill();
      }
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 LinkedIn URL Resolver running on http://0.0.0.0:${PORT}`);
});

