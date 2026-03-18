'use client';

import { Database, Layers, GitBranch, RefreshCw, Shield, Clock } from 'lucide-react';

export function UseCasesSection() {
  const useCases = [
    {
      icon: <Database className="w-6 h-6" />,
      title: 'Column Backfills',
      description: 'Added a new column? Backfill existing rows in batches. sluice handles the loop, delay, and completion tracking automatically.',
    },
    {
      icon: <Layers className="w-6 h-6" />,
      title: 'Schema + Data Migrations',
      description: 'Run migrations and backfills in the right order with interleaved mode. No manual coordination between DDL and DML.',
    },
    {
      icon: <GitBranch className="w-6 h-6" />,
      title: 'Branch Database Switching',
      description: 'Switch your local database between feature branches without resetting. sluice rolls back and migrates forward safely.',
    },
    {
      icon: <RefreshCw className="w-6 h-6" />,
      title: 'Resumable Long Runs',
      description: 'Backfilling millions of rows? If the process dies mid-run, restart and it picks up from the last completed version.',
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: 'Trigger Bypass',
      description: 'Backfills that fire triggers can be slow or dangerous. Set GUC values to skip triggers, re-enable per-backfill with SET LOCAL.',
    },
    {
      icon: <Clock className="w-6 h-6" />,
      title: 'Merge Conflict Prevention',
      description: 'Two branches added migration 050? Renumber automatically before merging. Annotations in backfill files update too.',
    },
  ];

  return (
    <section id="use-cases" className="py-12 sm:py-16 lg:py-20 bg-dark-slate">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10 sm:mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-cream mb-3 sm:mb-4">
            Use Cases
          </h2>
          <p className="text-cream/70 text-base sm:text-lg lg:text-xl max-w-3xl mx-auto">
            sluice handles the common patterns that trip up PostgreSQL data migrations
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          {useCases.map((useCase, index) => (
            <div
              key={index}
              className="bg-dark-gray/50 border border-sluice-blue/20 rounded-xl p-5 sm:p-6 hover:border-sluice-cyan/40 transition-all"
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-sluice-blue to-sluice-cyan rounded-lg flex items-center justify-center text-white mb-3 sm:mb-4">
                {useCase.icon}
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-cream mb-2">{useCase.title}</h3>
              <p className="text-cream/60 text-sm sm:text-base leading-relaxed">{useCase.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
