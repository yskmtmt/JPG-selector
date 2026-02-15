
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

        // Fetch HTML
        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
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
        return NextResponse.json({ error: 'Failed to process request: ' + error.message }, { status: 500 });
    }
}
