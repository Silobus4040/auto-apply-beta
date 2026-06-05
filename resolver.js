const express = require('express');
const { chromium } = require('playwright');
const app = express();
const PORT = 3010;

app.get('/resolve', async (req, res) => {
  const jobUrl = req.query.url;
  if (!jobUrl) {
    return res.status(400).json({ error: 'Missing URL parameter' });
  }

  console.log(`[RESOLVER] Resolving: ${jobUrl}`);
  let browser;
  try {
    browser = await chromium.launch({ 
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote'
      ] 
    });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const applyButtonSelector = 'button.jobs-apply-button, a.jobs-apply-button, [data-is-link-to-external-site="true"]';
    await page.waitForSelector(applyButtonSelector, { timeout: 10000 });

    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      page.click(applyButtonSelector)
    ]);

    await newPage.waitForLoadState('domcontentloaded', { timeout: 15000 });
    const finalUrl = newPage.url();

    console.log(`[RESOLVER] Success → ${finalUrl}`);
    res.json({ success: true, applyUrl: finalUrl });

  } catch (error) {
    console.error(`[RESOLVER] Error: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 LinkedIn URL Resolver running on http://0.0.0.0:${PORT}`);
});
