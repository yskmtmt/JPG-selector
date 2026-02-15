
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
        setError('No JPG images found on this page.');
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
    <main className="min-h-screen p-4 sm:p-8 bg-gray-50 text-gray-900 font-sans">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 sm:mb-8 text-center text-blue-600">JPG Downloader</h1>

        <form onSubmit={handleSubmit} className="mb-8 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter URL (e.g., https://example.com)"
              required
              className="w-full p-3 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm text-base"
            />
            {url && (
              <button
                type="button"
                onClick={() => setUrl('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                title="Clear input"
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors shadow-sm active:scale-95 touch-manipulation"
          >
            {loading ? 'Scanning...' : 'Scan'}
          </button>
        </form>

        {error && (
          <div className="p-4 mb-6 bg-red-100 text-red-700 border border-red-200 rounded-lg text-sm">
            {error}
          </div>
        )}

        {images.length > 0 && (
          <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-100 mb-8">
            <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-base sm:text-lg font-semibold text-gray-700">Image List (Ascending)</h2>
              <span className="text-xs sm:text-sm text-gray-500">{images.length} found</span>
            </div>
            <ul className="divide-y divide-gray-100">
              {images.map((img, index) => (
                <li key={index} className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between group">
                  <div className="flex-1 min-w-0 mr-4">
                    <a
                      href={img.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 font-medium truncate block text-sm"
                      title={img.url}
                    >
                      {img.url.split('/').pop()}
                    </a>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-gray-400 truncate max-w-[150px] sm:max-w-xs">{img.url}</span>
                      {img.size > 0 && (
                        <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1 rounded whitespace-nowrap">
                          {formatSize(img.size)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={img.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 bg-blue-50 text-blue-600 rounded text-xs font-semibold hover:bg-blue-100 transition-colors"
                    >
                      Open
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {images.length === 0 && !loading && !error && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-sm">Enter a URL to find JPG images.</p>
          </div>
        )}
      </div>
    </main>
  );
}
