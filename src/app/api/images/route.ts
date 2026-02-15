
import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';

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

        // Fetch HTML with comprehensive headers to bypass anti-bot blocks
        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Upgrade-Insecure-Requests': '1',
                'Referer': url
            },
        });

        const html = response.data;
        const $ = cheerio.load(html);
        // Extract and filter links
        const imgList: { url: string; number: number }[] = [];

        const processUrl = (link: string | undefined) => {
            if (!link) return;
            const lower = link.toLowerCase();

            // Filter for jpg/jpeg
            if (lower.includes('.jpg') || lower.includes('.jpeg')) {
                try {
                    const absoluteUrl = new URL(link, url).toString();
                    const fileName = absoluteUrl.split('/').pop() || '';

                    // Match last 2 digits before extension (e.g., image01.jpg)
                    const match = fileName.match(/(\d{2})\.(?:jpg|jpeg)$/i);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        // Avoid duplicates
                        if (!imgList.some(item => item.url === absoluteUrl)) {
                            imgList.push({ url: absoluteUrl, number: num });
                        }
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

        console.log(`Found ${imgList.length} candidate JPGs with 2-digit suffix.`);

        // Sort by the extracted number (ascending)
        imgList.sort((a, b) => a.number - b.number);

        // Limit to 15
        const top15 = imgList.slice(0, 15).map(item => ({
            url: item.url,
            size: 0 // Size is no longer the priority, but keeping the structure
        }));

        return NextResponse.json({ images: top15 });

    } catch (error: any) {
        console.error('API Error:', error.message);
        const status = error.response?.status;
        if (status === 403) {
            return NextResponse.json({
                error: 'Access Forbidden (403). The website is blocking automated access. Try another URL or use a proxy.'
            }, { status: 403 });
        }
        return NextResponse.json({ error: 'Failed to process request: ' + error.message }, { status: 500 });
    }
}
