'use client';
/**
 * EFFIBOOKS — ProductCard Component (UI fix)
 * src/components/ProductCard.jsx
 *
 * FIXES:
 *   - Product name was running directly into the price with no space
 *     (e.g. "The 3p Fulfilled SnowboardKES 2,629.95")
 *     Fixed by using proper flex layout with min-width:0 and flex:1
 *   - Gift Card variants showed all 4 variants cluttered in one row
 *     Now only shows variants that are actually low/out of stock
 *     and uses a cleaner "Size: N left" format
 *   - isRedZone prop was missing from destructuring (caused the 500 error)
 */

export default function ProductCard({ product, currency = 'USD', isRedZone = false }) {

  const variants  = product?.variants || [];
  const price     = parseFloat(variants[0]?.price || 0);

  // Total stock across all variants
  const totalQty = variants.reduce(
    (sum, v) => sum + (parseInt(v?.inventory_quantity) || 0), 0
  );

  // Only show variant breakdown when:
  //   1. There ARE multiple variants, AND
  //   2. At least one variant is low/out of stock (≤10 units)
  //   3. We only show variants that are low or out — not all variants
  const hasMultipleVariants = variants.length > 1;
  const lowVariants = hasMultipleVariants
    ? variants.filter(v => (parseInt(v?.inventory_quantity) || 0) <= 10)
    : [];
  const showVariantBreakdown = lowVariants.length > 0;

  // Stock badge text and colour based on total quantity
  const stockBadge =
    totalQty <= 0  ? { label: 'Out of stock',             bg: '#FEE2E2', color: '#991B1B', dot: '#EF4444' } :
    totalQty <= 3  ? { label: `${totalQty} left — critical`, bg: '#FFF7ED', color: '#9A3412', dot: '#F97316' } :
    totalQty <= 10 ? { label: `${totalQty} left — low`,      bg: '#FFFBEB', color: '#92400E', dot: '#F59E0B' } :
                     { label: `${totalQty} in stock`,         bg: '#F0FDF4', color: '#166534', dot: '#22C55E' };

  // Format price as currency string
  const formattedPrice = new Intl.NumberFormat('en', {
    style: 'currency', currency, minimumFractionDigits: 2,
  }).format(price);

  return (
    <li
      className="product-row"
      data-title={(product.title || '').toLowerCase()}
      style={{
        // Red zone styling: red left border + very light red background
        borderLeft:  isRedZone ? '4px solid #FCA5A5' : '4px solid transparent',
        background:  isRedZone ? '#FFF5F5' : '#FFFFFF',
        padding:     '14px 20px',
        display:     'flex',
        flexDirection: 'column',
        gap:         '8px',
        transition:  'background 0.1s',
        cursor:      'default',
      }}
      onMouseEnter={e => e.currentTarget.style.background = isRedZone ? '#FEE2E2' : '#F7F3ED'}
      onMouseLeave={e => e.currentTarget.style.background = isRedZone ? '#FFF5F5' : '#FFFFFF'}
    >

      {/* ── Main row ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>

        {/* Thumbnail */}
        <div style={{
          width: '40px', height: '40px', flexShrink: 0,
          borderRadius: '8px', overflow: 'hidden',
          background: '#F7F3ED', border: '1px solid #DDD6CE',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {product.image?.src ? (
            <img
              src={product.image.src}
              alt={product.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{ fontSize: '16px' }}>📦</span>
          )}
        </div>

        {/* Product name + type — flex:1 + minWidth:0 prevents overflow into price */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontWeight:   '600',
            fontSize:     '14px',
            color:        '#111827',
            margin:       0,
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
          }}>
            {product.title}
          </p>
          <p style={{
            fontSize:      '11px',
            color:         '#9CA3AF',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin:        '2px 0 0',
          }}>
            {product.product_type || 'Uncategorized'}
            {hasMultipleVariants && (
              <span style={{ marginLeft: '8px', color: '#D1D5DB' }}>
                · {variants.length} variants
              </span>
            )}
          </p>
        </div>

        {/* Price + stock badge — flex-shrink:0 keeps them from squishing */}
        <div style={{
          display:    'flex',
          alignItems: 'center',
          gap:        '12px',
          flexShrink:  0,         // Never shrinks — price always fully visible
        }}>
          <span style={{
            fontFamily:  'monospace',
            fontSize:    '14px',
            fontWeight:  '600',
            color:       '#1F2937',
            whiteSpace:  'nowrap',
          }}>
            {formattedPrice}
          </span>

          {/* Stock badge */}
          <span style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          '6px',
            padding:      '4px 10px',
            borderRadius: '20px',
            fontSize:     '12px',
            fontWeight:   '500',
            background:   stockBadge.bg,
            color:        stockBadge.color,
            whiteSpace:   'nowrap',
          }}>
            {/* Pulsing dot on out-of-stock */}
            {totalQty <= 0 ? (
              <span className="relative flex" style={{ width: '7px', height: '7px' }}>
                <span
                  className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                  style={{ background: stockBadge.dot }}
                />
                <span
                  className="relative inline-flex rounded-full"
                  style={{ width: '7px', height: '7px', background: stockBadge.dot }}
                />
              </span>
            ) : (
              <span style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: stockBadge.dot, flexShrink: 0,
              }} />
            )}
            {stockBadge.label}
          </span>
        </div>
      </div>

      {/* ── Variant breakdown (only low/out-of-stock variants, not all) ── */}
      {showVariantBreakdown && (
        <div style={{
          marginLeft: '54px',   // Align with product name (thumbnail width + gap)
          display:    'flex',
          flexWrap:   'wrap',
          gap:        '6px',
        }}>
          {lowVariants.map(v => {
            const qty = parseInt(v?.inventory_quantity) || 0;
            // Each variant badge shows a clean "Variant name: N left" format
            return (
              <span
                key={v.id}
                style={{
                  fontSize:     '11px',
                  padding:      '3px 9px',
                  borderRadius: '6px',
                  fontWeight:   '500',
                  // Colour based on individual variant stock
                  background:   qty <= 0 ? '#FEE2E2' : qty <= 3 ? '#FFF7ED' : '#FFFBEB',
                  color:        qty <= 0 ? '#991B1B' : qty <= 3 ? '#9A3412' : '#92400E',
                  border:       `1px solid ${qty <= 0 ? '#FECACA' : qty <= 3 ? '#FED7AA' : '#FDE68A'}`,
                }}
              >
                {/* Skip "Default Title" — only show meaningful variant names */}
                {v.title !== 'Default Title' ? v.title : 'Default'}: {qty <= 0 ? 'out of stock' : `${qty} left`}
              </span>
            );
          })}
        </div>
      )}
    </li>
  );
}
