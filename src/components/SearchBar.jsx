'use client';
/**
 * EFFIBOOKS — SearchBar Component
 * src/components/SearchBar.jsx
 *
 * Client-side instant search for the inventory list.
 * Filters product rows by title without any server round-trips.
 *
 * How it works:
 * - Each ProductCard li has data-title="product name in lowercase"
 * - On input, we find all .product-row elements and show/hide by matching
 * - Zero dependencies, works entirely with DOM queries
 */

import { useCallback } from 'react';

export default function SearchBar() {
  const handleSearch = useCallback((e) => {
    const query = e.target.value.toLowerCase().trim();
    const rows = document.querySelectorAll('.product-row');

    let visibleCount = 0;

    rows.forEach((row) => {
      const title = row.dataset.title || '';
      const matches = query === '' || title.includes(query);
      row.style.display = matches ? '' : 'none';
      if (matches) visibleCount++;
    });

    // Show/hide the "no results" message
    let noResults = document.getElementById('no-search-results');
    if (!noResults && visibleCount === 0 && query !== '') {
      noResults = document.createElement('li');
      noResults.id = 'no-search-results';
      noResults.className = 'py-10 text-center text-gray-400 italic text-sm';
      noResults.textContent = `No products matching "${e.target.value}"`;
      document.getElementById('product-list')?.appendChild(noResults);
    } else if (noResults) {
      if (visibleCount === 0 && query !== '') {
        noResults.textContent = `No products matching "${e.target.value}"`;
        noResults.style.display = '';
      } else {
        noResults.style.display = 'none';
      }
    }
  }, []);

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
        🔍
      </span>
      <input
        type="text"
        placeholder="Search inventory…"
        onChange={handleSearch}
        className="pl-9 pr-4 py-2 text-sm border border-[#DDD6CE] rounded-lg bg-[#F7F3ED] focus:outline-none focus:ring-2 focus:ring-[#2D6A4F] focus:border-transparent placeholder-gray-400 w-56 transition-all"
      />
    </div>
  );
}
