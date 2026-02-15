
'use client';

import { useState } from 'react';
import axios from 'axios';

type ImageResult = {
  url: string;
  size: number;
};

export default function Home() {
  const [url, setUrl] = useState('');
  const [images, setImages] = useState<ImageResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setImages([]);

    try {
      const response = await axios.post('/api/images', { url });
      setImages(response.data.images);
      if (response.data.images.length === 0) {
        setError('No JPG images found or unable to determine sizes.');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch images. Please check the URL and try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <main className="min-h-screen p-8 bg-gray-50 text-gray-900 font-sans">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center text-blue-600">JPG Downloader</h1>

        <form onSubmit={handleSubmit} className="mb-8 flex gap-4">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter URL to scrape (e.g., https://example.com)"
            required
            className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors shadow-sm"
          >
            {loading ? 'Scanning...' : 'Scan'}
          </button>
        </form>

        {error && (
          <div className="p-4 mb-6 bg-red-100 text-red-700 border border-red-200 rounded-lg">
            {error}
          </div>
        )}

        {images.length > 0 && (
          <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-100">
            <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-700">Top 10 Largest Images</h2>
              <span className="text-sm text-gray-500">{images.length} found</span>
            </div>
            <ul className="divide-y divide-gray-100">
              {images.map((img, index) => (
                <li key={index} className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between group">
                  <div className="flex-1 min-w-0 mr-4">
                    <a
                      href={img.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 font-medium truncate block"
                      title={img.url}
                    >
                      {img.url}
                    </a>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500 whitespace-nowrap">
                    <span className="font-mono bg-gray-100 px-2 py-1 rounded">{formatSize(img.size)}</span>
                    <a
                      href={img.url}
                      download
                      className="text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Open"
                    >
                      Open
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
