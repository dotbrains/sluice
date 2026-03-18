'use client';

import { ExternalLink, BookOpen, Database, ShieldAlert, RotateCcw, Layers, GitBranch } from 'lucide-react';

const contributions = [
  {
    icon: <Database className="w-5 h-5" />,
    title: 'Batched Execution',
    description:
      'Row-level locks per transaction, configurable inter-batch delay, and a hard LIMIT requirement enforced at parse time.',
  },
  {
    icon: <ShieldAlert className="w-5 h-5" />,
    title: 'Cycle Detection',
    description:
      'A partial-batch invariant catches broken WHERE clauses before they loop forever — zero database overhead, no false positives.',
  },
  {
    icon: <RotateCcw className="w-5 h-5" />,
    title: 'Resume Semantics',
    description:
      'A completed boolean in the version table restarts interrupted batch loops exactly where they left off, using the idempotent WHERE clause as the continuation.',
  },
  {
    icon: <Layers className="w-5 h-5" />,
    title: 'Annotation-Driven Interleaving',
    description:
      '-- @migration comments in SQL files declare prerequisite migrations, enforcing correct ordering between schema changes and the data transforms that depend on them.',
  },
  {
    icon: <GitBranch className="w-5 h-5" />,
    title: 'Git-Aware Version Management',
    description:
      'Detects and resolves migration version collisions between branches using git plumbing — works correctly during active merge and rebase conflicts.',
  },
];

export function PaperSection() {
  return (
    <section id="paper" className="py-12 sm:py-16 lg:py-20 bg-dark-gray/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10 sm:mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-sluice-blue/10 border border-sluice-blue/30 rounded-full text-sluice-blue text-xs font-medium mb-4">
            Technical Paper
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-cream mb-3 sm:mb-4">
            The Design Behind sluice
          </h2>
          <p className="text-cream/70 text-base sm:text-lg lg:text-xl max-w-3xl mx-auto">
            A deep-dive into the five technical contributions that make production-grade backfills possible
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">
          {/* Paper preview card */}
          <div className="bg-dark-slate border border-sluice-blue/20 rounded-2xl p-8 sm:p-10">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-sluice-blue to-sluice-cyan rounded-lg flex items-center justify-center text-white flex-shrink-0">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sluice-blue text-xs font-medium uppercase tracking-wider mb-1">
                  Technical Paper
                </p>
                <h3 className="text-cream font-bold text-lg sm:text-xl leading-snug">
                  sluice: A Git-Aware Batched Backfill Runner for PostgreSQL
                </h3>
              </div>
            </div>
            <p className="text-cream/50 text-xs mb-5">Nicholas Adamou — dotbrains</p>
            <p className="text-cream/70 text-sm leading-relaxed mb-8">
              Production database migrations are well-understood: tools like Flyway, Liquibase, and
              Postgrator apply versioned SQL scripts in order. Data backfills are not. The standard
              practice — a raw SQL script run manually — has no batching, no safety rails, no
              resumability, and no coordination with the migrations they depend on. This paper presents
              sluice and the five design decisions that change that.
            </p>
            <a
              href="https://github.com/dotbrains/sluice/blob/master/PAPER.md"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-sluice-blue to-sluice-cyan hover:from-sluice-cyan hover:to-sluice-sky text-white px-6 py-3 rounded-lg shadow-lg shadow-sluice-blue/30 text-sm font-semibold transition-all"
            >
              Read the Paper
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          {/* Five contributions */}
          <div className="space-y-4">
            {contributions.map((c, i) => (
              <div
                key={i}
                className="flex gap-4 bg-dark-slate border border-sluice-blue/10 hover:border-sluice-cyan/30 rounded-xl p-4 sm:p-5 transition-all group"
              >
                <div className="w-9 h-9 bg-gradient-to-br from-sluice-blue to-sluice-cyan rounded-lg flex items-center justify-center text-white flex-shrink-0 group-hover:scale-110 transition-transform">
                  {c.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sluice-blue text-xs font-medium">({i + 1})</span>
                    <h4 className="text-cream font-semibold text-sm sm:text-base">{c.title}</h4>
                  </div>
                  <p className="text-cream/60 text-xs sm:text-sm leading-relaxed">{c.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
