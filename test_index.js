const { chromium } = require('playwright');
const express = require('express');
const app = express();
app.use(express.static('C:/Users/pc/Documents/auto-apply-landing'));

const server = app.listen(3000, async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
    page.on('dialog', async dialog => {
        console.log('DIALOG:', dialog.message());
        await dialog.dismiss();
    });

    await page.goto('http://localhost:3000/index.html');
    
    // Open Modal
    await page.click('a:has-text("Score Resume - Free")');
    
    // Fill form
    await page.fill('input[name="name"]', 'Test User');
    await page.fill('input[name="location"]', 'USA');
    await page.fill('input[name="job_titles"]', 'Developer');
    
    // Upload file
    await page.setInputFiles('input[type="file"]', 'C:/Users/pc/Downloads/Updated Adetomiwa Ogunniyi - Resume.pdf');
    
    // Submit
    await page.click('button:has-text("Analyze My Resume")');
    
    // Wait a bit
    await page.waitForTimeout(10000);
    
    await browser.close();
    server.close();
});
