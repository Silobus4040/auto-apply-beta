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
    const currentUrl = page.url();
    console.log(`[RESOLVER] Loaded page. URL: ${currentUrl}`);

    const applyButtonSelector = 'button.jobs-apply-button, a.jobs-apply-button, .apply-button, [data-is-link-to-external-site="true"]';
    
    try {
      await page.waitForSelector(applyButtonSelector, { timeout: 10000 });
    } catch (e) {
      const pageTitle = await page.title().catch(() => 'Unknown Title');
      const pageContent = await page.content().catch(() => 'Could not get content');
      console.error(`[RESOLVER] Selector timeout on job page. URL: "${currentUrl}", Title: "${pageTitle}"`);
      const fs = require('fs');
      try {
        fs.writeFileSync('/root/linkedin-resolver/error_dump.html', pageContent);
        console.log('[RESOLVER] Saved HTML dump to /root/linkedin-resolver/error_dump.html');
      } catch (fsErr) {
        fs.writeFileSync('./error_dump.html', pageContent);
        console.log('[RESOLVER] Saved HTML dump to ./error_dump.html');
      }
      throw e;
    }

    const button = await page.$(applyButtonSelector);
    const trackingName = (await button.getAttribute('data-tracking-control-name').catch(() => '')) || '';
    const buttonText = (await button.innerText().catch(() => '')) || '';
    const href = (await button.getAttribute('href').catch(() => '')) || '';

    console.log(`[RESOLVER] Button text: "${buttonText}", Tracking name: "${trackingName}", href: "${href}"`);

    // 1. Detect Onsite Application (Easy Apply)
    if (trackingName.includes('onsite') || buttonText.toLowerCase().includes('easy apply')) {
      console.log('[RESOLVER] Onsite application (Easy Apply) detected.');
      return res.json({ success: true, applyUrl: jobUrl, applyMethod: 'onsite' });
    }

    // 2. Direct external href optimization
    if (href && !href.startsWith('/') && !href.includes('linkedin.com/')) {
      console.log(`[RESOLVER] Success (Direct href) → ${href}`);
      return res.json({ success: true, applyUrl: href, applyMethod: 'offsite' });
    }

    // 3. Click and intercept page redirection
    console.log('[RESOLVER] External application detected. Clicking Apply...');
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      page.click(applyButtonSelector)
    ]);

    await newPage.waitForLoadState('domcontentloaded', { timeout: 15000 });
    const finalUrl = newPage.url();

    console.log(`[RESOLVER] Success → ${finalUrl}`);
    res.json({ success: true, applyUrl: finalUrl, applyMethod: 'offsite' });

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

