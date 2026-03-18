'use client';

import { Database, RefreshCw, Layers, GitBranch, Shield, Timer, Hash, ArrowLeftRight, Settings } from 'lucide-react';

export function FeaturesSection() {
  const features = [
    {
      icon: <Database className="w-6 h-6" />,
      title: 'Batched CTE Execution',
      description: 'Runs SQL backfills using the batched CTE pattern — SELECT with LIMIT, execute in a transaction, repeat until rowCount hits zero.',
    },
    {
      icon: <RefreshCw className="w-6 h-6" />,
      title: 'Resume from Interruption',
      description: 'Tracks completed versions in a sluice_versions table. If a run is interrupted, it picks up exactly where it left off.',
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: 'Cycle Detection',
      description: 'Detects infinite loops where a backfill keeps matching the same rows. Throws immediately instead of running forever.',
    },
    {
      icon: <Layers className="w-6 h-6" />,
      title: 'Migration Interleaving',
      description: 'Parses @migration annotations to run backfills after their prerequisite migration. Migrate → backfill → migrate → backfill.',
    },
    {
      icon: <Hash className="w-6 h-6" />,
      title: 'Version Renumbering',
      description: 'Detects migration version collisions between git branches and renumbers to avoid conflicts. Updates @migration annotations automatically.',
    },
    {
      icon: <GitBranch className="w-6 h-6" />,
      title: 'Safe Branch Switching',
      description: 'Finds the common ancestor, migrates down, checks out the target branch, migrates up. No manual rollback needed.',
    },
    {
      icon: <Timer className="w-6 h-6" />,
      title: 'Configurable Batch Delay',
      description: 'Set a delay between batches to reduce database load. Defaults to 200ms — enough to let replication and vacuums keep up.',
    },
    {
      icon: <ArrowLeftRight className="w-6 h-6" />,
      title: 'Trigger Bypass via GUCs',
      description: 'Set PostgreSQL GUC values at session level to bypass triggers during backfills. Individual backfills can re-enable with SET LOCAL.',
    },
    {
      icon: <Settings className="w-6 h-6" />,
      title: 'Library + CLI',
      description: 'Use as a TypeScript library with full programmatic control, or as a CLI with five commands. Same engine, two interfaces.',
    },
  ];

  return (
    <section id="features" className="py-12 sm:py-16 lg:py-20 bg-dark-slate">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10 sm:mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-cream mb-3 sm:mb-4">
            Built for Production PostgreSQL
          </h2>
          <p className="text-cream/70 text-base sm:text-lg lg:text-xl max-w-3xl mx-auto">
            Every feature exists because a real backfill failed without it
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group bg-dark-gray/50 border border-sluice-blue/20 hover:border-sluice-cyan/40 rounded-xl p-5 sm:p-6 transition-all hover:shadow-lg hover:shadow-sluice-blue/10"
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-sluice-blue to-sluice-cyan rounded-lg flex items-center justify-center text-white mb-3 sm:mb-4 group-hover:scale-110 transition-transform">
                {feature.icon}
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-cream mb-2">{feature.title}</h3>
              <p className="text-cream/60 text-sm sm:text-base leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
