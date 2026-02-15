import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';

async function fetchWithPuppeteer(url: string) {
    console.log(`Starting Puppeteer fallback for ${url}`);

    // Vercel compatible browser launch
    const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: (chromium as any).defaultViewport || { width: 1280, height: 800 },
        executablePath: await chromium.executablePath(
            'https://github.com/sparticuz/chromium/releases/download/v121.0.0/chromium-v121.0.0-pack.tar'
        ),
        headless: (chromium as any).headless || true,
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        // Navigate to the URL
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Get the page content
        const html = await page.content();
        return html;
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
            console.log(`[API] Axios fetched successfully. HTML length: ${html.length}`);
        } catch (error: any) {
            if (error.response?.status === 403) {
                console.log('[API] Got 403 with Axios, falling back to Puppeteer...');
                try {
                    html = await fetchWithPuppeteer(url);
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

        const processUrl = (link: string | undefined, sourceTag: string) => {
            if (!link) return;
            const lower = link.toLowerCase();

            // Match JPG/JPEG or any link in an <img> tag (often images)
            const isJpg = lower.includes('.jpg') || lower.includes('.jpeg');
            const likelyImage = sourceTag === 'img' || isJpg;

            if (likelyImage) {
                try {
                    const absoluteUrl = new URL(link, url).toString();

                    // Basic filter to avoid common non-image paths on Wikipedia etc.
                    if (absoluteUrl.toLowerCase().includes('/wiki/file:')) return;

                    // Extract numerical suffix (e.g., image01.jpg -> 1)
                    const fileName = absoluteUrl.split('/').pop() || '';
                    const match = fileName.match(/(\d+)\.(?:jpg|jpeg)/i);
                    const num = match ? parseInt(match[1], 10) : 999999;

                    // Avoid duplicates
                    if (!imageUrlList.find(item => item.url === absoluteUrl)) {
                        imageUrlList.push({ url: absoluteUrl, number: num });
                    }
                } catch (e: any) {
                    // console.warn(`[API] Failed to parse URL: ${link}`, e.message);
                }
            }
        };

        $('a').each((_, element) => {
            processUrl($(element).attr('href'), 'a');
        });

        $('img').each((_, element) => {
            processUrl($(element).attr('src'), 'img');
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

        // Fetch sizes in parallel with a limit
        const imagesWithSizes = await Promise.all(
            targetImages.map(async (item) => {
                let size = 0;
                try {
                    const res = await axios.head(item.url, {
                        timeout: 3000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                        }
                    });
                    size = parseInt(res.headers['content-length'] || '0', 10);
                } catch (e: any) {
                    // HEAD failed, try small GET for headers if size is priority
                }
                return { url: item.url, size };
            })
        );

        console.log(`[API] Success. Returning ${imagesWithSizes.length} images.`);
        return NextResponse.json({
            images: imagesWithSizes,
            debug: {
                totalFound: imageUrlList.length,
                htmlLength: html.length
            }
        });

    } catch (error: any) {
        console.error('[API] Fatal Error:', error.message);
        const status = error.response?.status;
        if (status === 403) {
            return NextResponse.json({
                error: 'Access Forbidden (403). The website is blocking automated access.'
            }, { status: 403 });
        }
        return NextResponse.json({ error: 'Failed: ' + error.message }, { status: 500 });
    }
}

