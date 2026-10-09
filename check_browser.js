import puppeteer from 'puppeteer';
import express from 'express';

const app = express();
app.use(express.static('/home/daibaifa/Documents/antigravity/Eager/Eager_v6'));
const server = app.listen(0, async () => {
    const port = server.address().port;
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    
    await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0' });
    
    // Switch to 4 player mode
    await page.evaluate(() => {
        window.arcade.playerMode = 4;
        window.arcade.syncPlayerModeUI();
    });
    await new Promise(r => setTimeout(r, 200));

    // Test chaos ball
    console.log("Starting Chaos Ball...");
    await page.click('#card-neonchaosball');
    await new Promise(r => setTimeout(r, 200));
    await page.click('#btn-launch-game');
    await new Promise(r => setTimeout(r, 500));
    console.log("Exiting Chaos Ball...");
    await page.evaluate(() => window.arcade.exitActiveGame());

    // Test symmetry clash
    console.log("Starting Symmetry Clash...");
    await page.click('#card-symmetryclash');
    await new Promise(r => setTimeout(r, 200));
    await page.click('#btn-launch-game');
    await new Promise(r => setTimeout(r, 500));
    console.log("Exiting Symmetry Clash...");
    await page.evaluate(() => window.arcade.exitActiveGame());

    await browser.close();
    server.close();
});
