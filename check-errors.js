const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  await page.goto('file:///C:/Users/pc/Documents/auto-apply-landing/index.html');
  await page.waitForTimeout(2000);
  
  await browser.close();
})();
