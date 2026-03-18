'use client';

export function StatsSection() {
  return (
    <section className="py-12 sm:py-16 bg-dark-gray/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-8 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-cream mb-3 sm:mb-4">
            Data migrations that don&apos;t take down production
          </h2>
          <p className="text-cream/70 text-base sm:text-lg lg:text-xl">
            Battle-tested patterns from real-world PostgreSQL backfills at scale
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 md:gap-8 text-center">
          <div>
            <div className="text-2xl sm:text-3xl font-bold text-gradient mb-1 sm:mb-2">Batch + Resume</div>
            <div className="text-cream/60 text-sm sm:text-base">Execution Model</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-bold text-gradient mb-1 sm:mb-2">Cycle</div>
            <div className="text-cream/60 text-sm sm:text-base">Detection</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-bold text-gradient mb-1 sm:mb-2">Interleaved</div>
            <div className="text-cream/60 text-sm sm:text-base">Migration + Backfill</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-bold text-gradient mb-1 sm:mb-2">Zero</div>
            <div className="text-cream/60 text-sm sm:text-base">Downtime</div>
          </div>
        </div>
      </div>
    </section>
  );
}
