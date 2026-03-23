'use client';

import React from 'react';
import { Github, Terminal } from 'lucide-react';

interface HeroSectionProps {
  onLearnMore?: () => void;
}

export function HeroSection({ onLearnMore }: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden">
      {/* Background with animated gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-sluice-blue/10 via-dark-slate to-dark-slate">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-sluice-cyan/20 via-transparent to-transparent"></div>
      </div>

      {/* Hero Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-24 sm:pt-32 lg:pt-40 pb-16 sm:pb-24 lg:pb-32">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-sluice-blue/10 border border-sluice-blue/20 rounded-full mb-4 sm:mb-6">
            <Github className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sluice-blue" />
            <span className="text-xs sm:text-sm text-sluice-blue font-medium">Open Source • PolyForm Shield 1.0.0</span>
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-cream leading-tight mb-4 sm:mb-6 px-4">
            PostgreSQL Backfills,{' '}
            <span className="text-gradient drop-shadow-md">
              Safely
            </span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-cream/70 mb-6 sm:mb-8 leading-relaxed max-w-4xl mx-auto px-4">
            Batched data backfills with cycle detection, resume-from-interruption, migration interleaving, and safe branch switching. Zero downtime, zero surprises.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4">
            <a
              href="/#quick-start"
              className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-sluice-blue to-sluice-cyan hover:from-sluice-cyan hover:to-sluice-sky text-white px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-semibold rounded-lg shadow-lg shadow-sluice-blue/30 transition-all"
            >
              <Terminal className="w-4 h-4 sm:w-5 sm:h-5" />
              Get Started
            </a>
            <a
              href="https://github.com/dotbrains/sluice"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-dark-gray hover:bg-dark-slate text-cream px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-semibold rounded-lg border border-sluice-blue hover:border-sluice-cyan transition-all"
            >
              <Github className="w-4 h-4 sm:w-5 sm:h-5" />
              View on GitHub
            </a>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-12 sm:mt-16 md:mt-24 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 md:gap-8 max-w-5xl mx-auto px-4">
          <div className="bg-dark-gray/50 backdrop-blur-sm border border-sluice-blue/30 rounded-xl p-4 sm:p-6 text-center">
            <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-gradient mb-2">
              5
            </div>
            <div className="text-cream/60 text-sm sm:text-base md:text-lg">CLI Commands</div>
          </div>
          <div className="bg-dark-gray/50 backdrop-blur-sm border border-sluice-cyan/30 rounded-xl p-4 sm:p-6 text-center">
            <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-gradient mb-2">
              Batched
            </div>
            <div className="text-cream/60 text-sm sm:text-base md:text-lg">CTE Pattern</div>
          </div>
          <div className="bg-dark-gray/50 backdrop-blur-sm border border-sluice-sky/30 rounded-xl p-4 sm:p-6 text-center">
            <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-gradient mb-2">
              TypeScript
            </div>
            <div className="text-cream/60 text-sm sm:text-base md:text-lg">Library + CLI</div>
          </div>
        </div>
      </div>
    </section>
  );
}
