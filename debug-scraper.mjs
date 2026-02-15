
import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';

async function main() {
    const url = 'https://en.wikipedia.org/wiki/Nature';
    console.log(`Fetching ${url}...`);

    try {
        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            },
        });

        const html = response.data;
        console.log(`Fetched HTML. Length: ${html.length}`);
        const $ = cheerio.load(html);
        console.log(`Found ${$('a').length} links and ${$('img').length} images.`);

        const imageUrls = new Set();

        const processUrl = (link) => {
            if (!link) return;
            const lower = link.toLowerCase();
            // Filter out wiki pages
            if (lower.includes('/wiki/')) return;

            if (lower.includes('.jpg') || lower.includes('.jpeg')) {
                try {
                    const absoluteUrl = new URL(link, url).toString();
                    imageUrls.add(absoluteUrl);
                } catch {
                    // Ignore
                }
            }
        };

        $('a').each((_, element) => {
            processUrl($(element).attr('href'));
        });

        $('img').each((_, element) => {
            processUrl($(element).attr('src'));
        });

        console.log(`Found ${imageUrls.size} unique candidate JPGs.`);

        let count = 0;
        for (const imgUrl of imageUrls) {
            if (count >= 10) break;
            try {
                console.log(`Checking size for ${imgUrl}`);
                const head = await axios.head(imgUrl, {
                    timeout: 5000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Referer': url
                    }
                });
                console.log(`Size for ${imgUrl}: ${head.headers['content-length']}`);
                count++;
            } catch (e) {
                console.log(`Failed to check size for ${imgUrl}: ${e.message}`);
            }
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

main();
