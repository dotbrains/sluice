'use client';

import React, { useState } from 'react';
import { CodeBlock } from '@/components/CodeBlock';

export function QuickStartSection() {
  const [installMethod, setInstallMethod] = useState<'npm' | 'pnpm' | 'yarn'>('npm');

  const npmExample = `npm install @dotbrains/sluice pg-promise`;
  const pnpmExample = `pnpm add @dotbrains/sluice pg-promise`;
  const yarnExample = `yarn add @dotbrains/sluice pg-promise`;

  const installExamples = { npm: npmExample, pnpm: pnpmExample, yarn: yarnExample };

  return (
    <section id="quick-start" className="py-12 sm:py-16 lg:py-20 bg-dark-slate overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10 sm:mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-cream mb-3 sm:mb-4">
            Quick Start
          </h2>
          <p className="text-slate-gray text-base sm:text-lg lg:text-xl max-w-3xl mx-auto">
            Install sluice and run your first backfill in under a minute
          </p>
        </div>
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">
          <div className="bg-dark-gray/50 rounded-xl p-6 sm:p-8 border border-sluice-blue/20 min-w-0">
            <h3 className="text-xl sm:text-2xl font-bold text-cream mb-4 sm:mb-6">1. Install</h3>
            <div className="bg-sluice-blue/10 border border-sluice-blue/30 rounded-lg p-3 sm:p-4 mb-4">
              <p className="text-cream text-xs sm:text-sm leading-relaxed">
                <span className="text-sluice-blue font-semibold">Note:</span> Configure the <code className="bg-dark-slate/80 px-1.5 py-0.5 rounded text-sluice-sky font-mono text-xs">@dotbrains</code> scope in your <code className="bg-dark-slate/80 px-1.5 py-0.5 rounded text-sluice-sky font-mono text-xs">.npmrc</code> first:{' '}
                <code className="bg-dark-slate/80 px-1.5 py-0.5 rounded text-sluice-sky font-mono text-xs">@dotbrains:registry=https://npm.pkg.github.com</code>
              </p>
            </div>
            <div className="flex gap-2 sm:gap-3 mb-6">
              {[
                { key: 'npm' as const, label: 'npm' },
                { key: 'pnpm' as const, label: 'pnpm' },
                { key: 'yarn' as const, label: 'yarn' },
              ].map((method) => (
                <button
                  key={method.key}
                  onClick={() => setInstallMethod(method.key)}
                  className={`flex-1 px-3 sm:px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    installMethod === method.key
                      ? 'bg-gradient-to-r from-sluice-blue to-sluice-cyan text-white shadow-lg shadow-sluice-blue/30'
                      : 'bg-dark-slate text-slate-gray hover:text-cream hover:border-sluice-blue/50 border border-sluice-blue/30'
                  }`}
                >
                  {method.label}
                </button>
              ))}
            </div>
            <CodeBlock
              code={installExamples[installMethod]}
              language="bash"
            />
          </div>
          <div className="bg-dark-gray/50 rounded-xl p-6 sm:p-8 border border-sluice-cyan/20 min-w-0">
            <h3 className="text-xl sm:text-2xl font-bold text-cream mb-4 sm:mb-6">2. Run</h3>
            <CodeBlock
              code={`# Set connection string
export DATABASE_URL=postgres://localhost:5432/myapp

# Run backfills
npx sluice backfill --folder=./backfills

# Run migrations
npx sluice migrate --folder=./migrations

# Run interleaved mode
npx sluice run --migrations=./migrations \\
  --backfills=./backfills`}
              language="bash"
            />
            <div className="mt-6 bg-sluice-blue/10 border border-sluice-blue/30 rounded-lg p-4 sm:p-5">
              <p className="text-cream text-sm leading-relaxed">
                <span className="text-sluice-blue font-semibold">Tip:</span> Each backfill SQL file must include a <code className="bg-dark-slate/80 px-2 py-1 rounded text-sluice-sky font-mono text-xs">LIMIT</code> clause — sluice validates this on startup and rejects backfills without one.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
