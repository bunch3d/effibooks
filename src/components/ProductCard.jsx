'use client';

export default function ProductCard({ product, currency = 'USD' }) {
  // Null-safe: some Shopify products have no variants array
  const variants = product?.variants || [];
  const price = parseFloat(variants[0]?.price || 0);

  // Sum inventory across all variants, treating null as 0
  const totalQty = variants.reduce(
    (sum, v) => sum + (parseInt(v?.inventory_quantity) || 0), 0
  );

  const hasMultipleVariants = variants.length > 1;

  const stockStatus =
    totalQty <= 0 ? { label: 'Out of stock', color: 'bg-red-100 text-red-700',    dot: 'bg-red-500'    } :
    totalQty <= 5 ? { label: `Low — ${totalQty} left`, color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' } :
                   { label: `${totalQty} in stock`,   color: 'bg-green-100 text-green-700',  dot: 'bg-green-500' };

  const formattedPrice = new Intl.NumberFormat('en', {
    style: 'currency', currency, minimumFractionDigits: 2,
  }).format(price);

  return (
    <li
      className="product-row py-4 px-6 flex items-center justify-between hover:bg-[#F7F3ED] transition-colors duration-100"
      data-title={(product.title || '').toLowerCase()}
    >
      <div className="flex items-center gap-4 min-w-0">
        <div className="w-10 h-10 rounded-lg bg-[#F7F3ED] border border-[#DDD6CE] flex items-center justify-center flex-shrink-0 overflow-hidden">
          {product.image?.src ? (
            <img src={product.image.src} alt={product.title} className="w-full h-full object-cover rounded-lg" />
          ) : (
            <span style={{ fontSize: 16 }}>📦</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{product.title}</p>
          <p className="text-xs text-gray-400 uppercase tracking-wide mt-0.5">
            {product.product_type || 'Uncategorized'}
            {hasMultipleVariants && <span className="ml-2 text-gray-300">· {variants.length} variants</span>}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-shrink-0">
        <span className="font-mono text-base font-semibold text-gray-800">{formattedPrice}</span>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${stockStatus.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${stockStatus.dot}`}></span>
          {stockStatus.label}
        </span>
      </div>
    </li>
  );
}
