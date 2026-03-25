'use client';
/**
 * EFFIBOOKS — BriefingCard Component
 * src/components/BriefingCard.jsx
 *
 * Displays the Gemini-generated daily briefing.
 * Accepts a Promise and shows a skeleton while the AI response loads.
 *
 * Note: because this is a client component receiving a server-side promise,
 * page.js uses React's `use()` pattern via a wrapper. For Sprint 2 simplicity,
 * we resolve the promise server-side and pass the result as a plain prop.
 */

export default function BriefingCard({ briefing, shopName }) {
  if (!briefing) return null;

  const isError = !!briefing.error && briefing.error !== 'missing_api_key';
  const isMissingKey = briefing.error === 'missing_api_key';

  // Parse health score from the briefing text
  const healthMatch = briefing.text?.match(/Business Health:\s*(Good|Needs Attention|Critical)/i);
  const healthScore = healthMatch?.[1] || null;
  const healthStyle =
    healthScore === 'Good'            ? { bg: 'bg-green-100', text: 'text-green-700', dot: '🟢' } :
    healthScore === 'Needs Attention' ? { bg: 'bg-amber-100', text: 'text-amber-700', dot: '🟡' } :
    healthScore === 'Critical'        ? { bg: 'bg-red-100',   text: 'text-red-700',   dot: '🔴' } :
                                        null;

  if (isMissingKey) {
    return (
      <div className="mb-6 bg-white border border-[#DDD6CE] rounded-xl p-5 flex items-start gap-4">
        <span className="text-2xl flex-shrink-0">🤖</span>
        <div>
          <p className="font-semibold text-gray-700 mb-1">AI Briefings not yet active</p>
          <p className="text-sm text-gray-500">
            Add <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">GEMINI_API_KEY</code> to your{' '}
            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">.env.local</code> to unlock
            daily plain-English briefings.{' '}
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-[#1B4332] underline">
              Get a free key →
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 bg-[#1B4332] border border-[#2D6A4F] rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-3 border-b border-[#2D6A4F] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[#C9952A] text-sm">✦</span>
          <span className="text-[#D8F3DC] text-xs font-semibold uppercase tracking-widest">
            Your Morning Brief
          </span>
        </div>
        <span className="text-[#2D6A4F] text-xs">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </span>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {isError ? (
          <p className="text-amber-300 text-sm italic">{briefing.text}</p>
        ) : (
          <p className="text-[#D8F3DC] text-[15px] leading-relaxed">
            {/* Remove the health score line from the main text for cleaner display */}
            {briefing.text?.replace(/Business Health:.*$/i, '').trim()}
          </p>
        )}
      </div>

      {/* Health score badge */}
      {healthStyle && (
        <div className="px-5 pb-4">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${healthStyle.bg} ${healthStyle.text}`}>
            {healthStyle.dot} Business Health: {healthScore}
          </span>
        </div>
      )}
    </div>
  );
}
