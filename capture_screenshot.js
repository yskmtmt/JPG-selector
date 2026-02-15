
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
    // Launch browser
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Set viewport for a reasonable screenshot size
    await page.setViewport({ width: 1280, height: 800 });

    console.log('Navigating to app...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

    // Type URL
    console.log('Typing URL...');
    const inputSelector = 'input[type="url"]';
    await page.waitForSelector(inputSelector);
    await page.type(inputSelector, 'https://en.wikipedia.org/wiki/Nature');

    // Click scan
    console.log('Starting scan...');
    const buttonSelector = 'button[type="submit"]';
    await page.click(buttonSelector);

    // Wait for results
    console.log('Waiting for results...');
    // We look for the "Top 10 Largest Images" header or any list item
    await page.waitForSelector('li a', { timeout: 30000 });

    // Wait a bit for images to stabilize if any (though we are just displaying a list)
    await new Promise(r => setTimeout(r, 2000));

    // Take screenshot
    const screenshotPath = path.join(__dirname, 'app-screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved to ${screenshotPath}`);

    await browser.close();
})();
