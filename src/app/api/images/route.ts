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
        } catch (error: any) {
            if (error.response?.status === 403) {
                console.log('Got 403 with Axios, falling back to Puppeteer...');
                html = await fetchWithPuppeteer(url);
            } else {
                throw error;
            }
        }

        const $ = cheerio.load(html);
        const imageUrlList: { url: string; number: number }[] = [];

        const processUrl = (link: string | undefined) => {
            if (!link) return;
            const lower = link.toLowerCase();

            // Match JPG/JPEG
            if (lower.includes('.jpg') || lower.includes('.jpeg')) {
                try {
                    const absoluteUrl = new URL(link, url).toString();

                    // Extract numerical suffix (e.g., image01.jpg -> 1)
                    const fileName = absoluteUrl.split('/').pop() || '';
                    const match = fileName.match(/(\d+)\.(?:jpg|jpeg)/i);
                    const num = match ? parseInt(match[1], 10) : 999999;

                    // Avoid duplicates
                    if (!imageUrlList.find(item => item.url === absoluteUrl)) {
                        imageUrlList.push({ url: absoluteUrl, number: num });
                    }
                } catch {
                    // Ignore invalid URLs
                }
            }
        };

        $('a').each((_, element) => {
            processUrl($(element).attr('href'));
        });

        $('img').each((_, element) => {
            processUrl($(element).attr('src'));
        });

        // Sort by extracted number (ascending)
        imageUrlList.sort((a, b) => a.number - b.number);

        // Limit results to stay within Vercel timeout limits
        const targetImages = imageUrlList.slice(0, 20);

        // Fetch sizes in parallel with a limit
        const imagesWithSizes = await Promise.all(
            targetImages.map(async (item) => {
                let size = 0;
                try {
                    const res = await axios.head(item.url, {
                        timeout: 5000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                        }
                    });
                    size = parseInt(res.headers['content-length'] || '0', 10);
                } catch (e) {
                    // Fallback to 0 if HEAD fails
                }
                return { url: item.url, size };
            })
        );

        return NextResponse.json({ images: imagesWithSizes });

    } catch (error: any) {
        console.error('API Error:', error.message);
        const status = error.response?.status;
        if (status === 403) {
            return NextResponse.json({
                error: 'Access Forbidden (403). The website is blocking automated access.'
            }, { status: 403 });
        }
        return NextResponse.json({ error: 'Failed' + error.message }, { status: 500 });
    }
}

