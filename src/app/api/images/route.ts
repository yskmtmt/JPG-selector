import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';

const isCloudflareBlock = (html: string) => {
    const lower = html.toLowerCase();
    const hasCF = lower.includes('cloudflare');
    const hasChallenge = lower.includes('cf-browser-verification') ||
        lower.includes('checking your browser') ||
        lower.includes('ray id:');
    const hasImg = lower.includes('<img');
    const hasTitle = lower.includes('<title>just a moment') || lower.includes('<title>attention required');

    // Cloudflare blocks often have CF strings and NO images, or a specific challenge title/text
    return hasChallenge || hasTitle || (hasCF && !hasImg);
};

async function fetchWithPuppeteer(url: string) {
    console.log(`[API] Starting Puppeteer fallback for ${url}`);

    const browser = await puppeteer.launch({
        args: [
            ...chromium.args,
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
        ],
        defaultViewport: (chromium as any).defaultViewport || { width: 1280, height: 800 },
        executablePath: await chromium.executablePath(
            'https://github.com/sparticuz/chromium/releases/download/v121.0.0/chromium-v121.0.0-pack.tar'
        ),
        headless: (chromium as any).headless || true,
    });

    try {
        const page = await browser.newPage();

        // Advanced stealth to mimic a real human browser
        await page.evaluateOnNewDocument(() => {
            // @ts-ignore
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            // @ts-ignore
            Object.defineProperty(navigator, 'languages', { get: () => ['ja-JP', 'ja', 'en-US', 'en'] });
            // @ts-ignore
            Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
            // @ts-ignore
            Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
            // @ts-ignore
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
            // @ts-ignore
            navigator.plugins.length = 4;
            // @ts-ignore
            window.chrome = { runtime: {} };

            // WebGL detection bypass
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function (parameter) {
                if (parameter === 37445) return 'Google Inc. (Intel)';
                if (parameter === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics (0x00009BC4) Direct3D11 vs_5_0 ps_5_0, D3D11)';
                return getParameter.apply(this, [parameter]);
            };
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        // Blocking some resources to speed up but keeping images/scripts
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['font', 'media', 'stylesheet', 'image'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        console.log(`[API] Puppeteer navigating...`);
        // Use 'domcontentloaded' to get in fast, then wait for CF to settle
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Cloudflare challenge wait loop (Optimized for Vercel 10s timeout)
        let attempts = 0;
        let htmlContent = '';
        while (attempts < 3) {
            htmlContent = await page.content();

            if (!isCloudflareBlock(htmlContent) && htmlContent.length > 5000) {
                console.log(`[API] Passed Cloudflare challenge after ${attempts} waits.`);
                break;
            }

            console.log(`[API] Still on challenge (Attempt ${attempts}). Waiting 2s...`);

            // Simulating user activity to trigger CF resolution
            try {
                await page.mouse.move(Math.random() * 200, Math.random() * 200);
                await page.evaluate(() => window.scrollBy(0, 50));
            } catch { }

            await new Promise(r => setTimeout(r, 2000));
            attempts++;
        }

        if (isCloudflareBlock(htmlContent)) {
            const err: any = new Error('Cloudflare bypass failed on Vercel environment.');
            err.htmlLen = htmlContent.length;
            err.title = htmlContent.match(/<title>(.*?)<\/title>/i)?.[1] || 'N/A';
            throw err;
        }

        // Quick scroll
        await page.evaluate(() => window.scrollBy(0, 500));
        await new Promise(r => setTimeout(r, 500));

        return await page.content();
    } finally {
        await browser.close();
    }
}

export async function POST(request: Request) {
    try {
        const { url } = await request.json();

        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        // Validate URL format
        try {
            new URL(url);
        } catch {
            return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
        }

        // Fetch HTML with comprehensive headers
        let html: string;
        let wasPuppeteer = false;
        console.log(`[API] Fetching URL: ${url}`);
        try {
            const response = await axios.get(url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
                    'Referer': url
                },
            });
            html = response.data;
            if (isCloudflareBlock(html)) {
                console.log('[API] Detected Cloudflare challenge in Axios response. Retrying with Puppeteer...');
                throw { response: { status: 403 } };
            }
            console.log(`[API] Axios fetched successfully. HTML length: ${html.length}`);
        } catch (error: any) {
            if (error.response?.status === 403 || error.message.includes('timeout')) {
                console.log('[API] Falling back to Puppeteer...');
                try {
                    html = await fetchWithPuppeteer(url);
                    wasPuppeteer = true;
                    console.log(`[API] Puppeteer fetched successfully. HTML length: ${html.length}`);
                } catch (puppeteerError: any) {
                    console.error(`[API] Puppeteer error: ${puppeteerError.message}`);
                    throw puppeteerError;
                }
            } else {
                console.error(`[API] Axios error (${error.response?.status}): ${error.message}`);
                throw error;
            }
        }

        const $ = cheerio.load(html);
        const imageUrlList: { url: string; number: number }[] = [];

        console.log(`[API] Analyzing tags: a=${$('a').length}, img=${$('img').length}`);

        const processElement = (el: cheerio.Element) => {
            const attrs = ['href', 'src', 'data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-srcset'];

            for (const attr of attrs) {
                let link = $(el).attr(attr);
                if (!link) continue;

                // Clean up comma-separated srcset
                if (attr === 'data-srcset' || attr === 'srcset') {
                    link = link.split(',')[0].split(' ')[0];
                }

                const lower = link.toLowerCase();
                const isJpg = lower.includes('.jpg') || lower.includes('.jpeg');
                const isImgTag = el.type === 'tag' && el.tagName === 'img';
                const likelyImage = isImgTag || isJpg;

                if (likelyImage) {
                    try {
                        const absoluteUrl = new URL(link, url).toString();
                        if (absoluteUrl.toLowerCase().includes('/wiki/file:')) continue;

                        const fileName = absoluteUrl.split('/').pop() || '';
                        const match = fileName.match(/(\d+)\.(?:jpg|jpeg)/i);
                        const num = match ? parseInt(match[1], 10) : 999999;

                        if (!imageUrlList.find(item => item.url === absoluteUrl)) {
                            imageUrlList.push({ url: absoluteUrl, number: num });
                        }
                    } catch { }
                }
            }
        };

        $('a, img').each((_, element) => {
            processElement(element as cheerio.Element);
        });

        console.log(`[API] Found ${imageUrlList.length} unique candidate URLs.`);

        if (imageUrlList.length === 0) {
            console.log('[API] No images found. Checking if HTML contains common image extensions in text...');
            // Simple check to see if the page even mentions jpgs
            if (!html.toLowerCase().includes('.jpg') && !html.toLowerCase().includes('.jpeg')) {
                console.log('[API] HTML does not seem to contain any JPG/JPEG links in raw text either.');
            }
        }

        // Sort by extracted number (ascending)
        imageUrlList.sort((a, b) => a.number - b.number);

        // Limit results
        const maxResults = 30;
        const targetImages = imageUrlList.slice(0, maxResults);
        console.log(`[API] Processing top ${targetImages.length} images for sizes.`);

        // Fetch sizes in parallel with a limit, skip if we used Puppeteer to save time for Vercel
        const imagesWithSizes = wasPuppeteer
            ? targetImages.map(item => ({ url: item.url, size: -1 }))
            : await Promise.all(
                targetImages.map(async (item) => {
                    let size = 0;
                    try {
                        const res = await axios.head(item.url, {
                            timeout: 2000,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                            }
                        });
                        size = parseInt(res.headers['content-length'] || '0', 10);
                    } catch (e: any) {
                        // HEAD failed
                    }
                    return { url: item.url, size };
                })
            );

        console.log(`[API] Success. Returning ${imagesWithSizes.length} images.`);
        return NextResponse.json({
            images: imagesWithSizes,
            debug: {
                totalFound: imageUrlList.length,
                htmlLength: html.length,
                isCloudflare: wasPuppeteer,
                title: $('title').text().trim(),
                hasImg: html.includes('<img'),
                wasPuppeteer
            }
        });

    } catch (error: any) {
        console.error('[API] Fatal Error:', error.message);
        return NextResponse.json({
            error: error.message.includes('Cloudflare') ? 'Cloudflare Block/Timeout (Vercel)' : 'Failed: ' + error.message,
            debug: {
                error: error.message,
                htmlLen: error.htmlLen || 0,
                title: error.title || 'Error',
                isCF: true
            }
        }, { status: 500 });
    }
}

