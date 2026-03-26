'use client';

//PROPS:
//   product   — Shopify product object from /products.json API
//   currency  — currency code e.g. 'KES', 'USD'
//   isRedZone — boolean: true if this product should get the red zone treatment

export default function ProductCard({ product, currency = 'USD' }) {
  // Null-safe: some Shopify products have no variants array
  const variants = product?.variants || [];
  const price = parseFloat(variants[0]?.price || 0); //price from the first variant (most products have one price)

  // Sum inventory across all variants, treating null as 0
  const totalQty = variants.reduce(
    (sum, v) => sum + (parseInt(v?.inventory_quantity) || 0), 0
  );
  // Whether to show variant breakdown (only if product has multiple variants)
  // const hasMultipleVariants = Array.isArray(product.variants) && product.variants.length > 1;

  const hasMultipleVariants = variants.length > 1;
  const showVariantBreakdown = hasMultipleVariants && totalQty <= 10; // Only show detail when low

  // ── Stock status — determines the badge color ──────────────────────────
  // Thresholds match the ones in alerts.js
  const stockStatus =
    totalQty <= 0  ? { label: 'Out of stock',        color: 'bg-red-100 text-red-700',    dot: 'bg-red-500'    } :
    totalQty <= 3  ? { label: `${totalQty} left — critical`, color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' } :
    totalQty <= 10 ? { label: `${totalQty} left — low`,      color: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-500'  } :
                     { label: `${totalQty} in stock`, color: 'bg-green-100 text-green-700', dot: 'bg-green-500'  };


  const formattedPrice = new Intl.NumberFormat('en', {
    style: 'currency', currency, minimumFractionDigits: 2,
  }).format(price);

  return (
    <li
      className={`product-row py-4 px-6 flex flex-col hover:bg-opacity-80 transition-colors duration-100 ${
        // Red zone gets a red left border and very light red background
        isRedZone
          ? 'border-l-4 border-red-400 bg-red-50 hover:bg-red-100'
          : 'hover:bg-[#F7F3ED]'
      }`}
      data-title={(product.title || '').toLowerCase()}
    >
      {/* Main row: thumbnail + name + price + stock badge */}
      <div className="flex items-center justify-between">

        {/* Left side: thumbnail + product info */}
        <div className="flex items-center gap-4 min-w-0">
          {/* Product thumbnail — shows image if available, box emoji if not */}
          <div className="w-10 h-10 rounded-lg bg-[#F7F3ED] border border-[#DDD6CE] flex items-center justify-center flex-shrink-0 overflow-hidden">
            {product.image?.src ? (
              <img
                src={product.image.src}
                alt={product.title}
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <span style={{ fontSize: 16 }}>📦</span>
            )}
          </div>

          {/* Product name and type */}
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{product.title}</p>
            <p className="text-xs text-gray-400 uppercase tracking-wide mt-0.5">
              {product.product_type || 'Uncategorized'}
              {hasMultipleVariants && (
                <span className="ml-2 text-gray-300">· {variants.length} variants</span>
              )}
            </p>
          </div>
        </div>

        {/* Right side: price + stock badge */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <span className="font-mono text-base font-semibold text-gray-800">
            {formattedPrice}
          </span>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${stockStatus.color}`}>
            {/* Pulsing dot on out-of-stock to draw the eye */}
            {totalQty <= 0 ? (
              <span className="relative flex h-1.5 w-1.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${stockStatus.dot} opacity-75`}></span>
                <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${stockStatus.dot}`}></span>
              </span>
            ) : (
              <span className={`w-1.5 h-1.5 rounded-full ${stockStatus.dot}`}></span>
            )}
            {stockStatus.label}
          </span>
        </div>
      </div>

      {/* Variant breakdown — only shown for low-stock multi-variant products */}
      {showVariantBreakdown && (
        <div className="mt-2 ml-14 flex flex-wrap gap-2">
          {variants.map(v => (
            <span
              key={v.id}
              className={`text-xs px-2 py-0.5 rounded border ${
                // Color each variant badge based on its individual stock level
                v.inventory_quantity <= 0  ? 'bg-red-50 border-red-200 text-red-600' :
                v.inventory_quantity <= 3  ? 'bg-orange-50 border-orange-200 text-orange-600' :
                                             'bg-gray-50 border-gray-200 text-gray-500'
              }`}
            >
              {/* Show variant name (e.g. "Large") and its individual stock */}
              {v.title !== 'Default Title' ? v.title : 'Default'}: {v.inventory_quantity} left
            </span>
          ))}
        </div>
      )}
    </li>
  );
}
