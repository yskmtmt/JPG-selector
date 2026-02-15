
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
        const imageUrls = new Set<string>();

        // Extract links
        const processUrl = (link: string | undefined) => {
            if (!link) return;
            const lower = link.toLowerCase();

            // Filter out wiki pages or other non-image pages that might have .jpg in URL
            if (lower.includes('/wiki/')) return;

            if (lower.includes('.jpg') || lower.includes('.jpeg')) {
                try {
                    const absoluteUrl = new URL(link, url).toString();
                    imageUrls.add(absoluteUrl);
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

        console.log(`Found ${imageUrls.size} candidate JPGs.`);

        const imagesWithSizes: { url: string; size: number }[] = [];

        // Fetch sizes
        const sizePromises = Array.from(imageUrls).map(async (imageUrl) => {
            try {
                const headResponse = await axios.head(imageUrl, {
                    timeout: 5000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Referer': url
                    }
                });
                const contentLength = headResponse.headers['content-length'];
                if (contentLength) {
                    const size = parseInt(contentLength, 10);
                    if (!isNaN(size)) {
                        imagesWithSizes.push({ url: imageUrl, size });
                    }
                }
            } catch {
                // Prepare to ignore image if HEAD fails
            }
        });

        await Promise.all(sizePromises);

        // Sort by size (descending)
        imagesWithSizes.sort((a, b) => b.size - a.size);

        // Top 10
        const top10 = imagesWithSizes.slice(0, 10);

        return NextResponse.json({ images: top10 });

    } catch (error: any) {
        console.error('API Error:', error.message);
        return NextResponse.json({ error: 'Failed to process request: ' + error.message }, { status: 500 });
    }
}
