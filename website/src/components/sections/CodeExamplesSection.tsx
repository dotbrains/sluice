'use client';

import React, { useState } from 'react';
import { CodeBlock } from '@/components/CodeBlock';

export function CodeExamplesSection() {
  const [activeTab, setActiveTab] = useState<'cli' | 'api' | 'backfill' | 'interleave' | 'branch'>('cli');

  const examples = {
    cli: `# Run backfills to completion
$ npx sluice backfill --folder=./backfills
→ Running backfill 001-backfill-user-status.sql...
→ Batch 1: 25000 rows updated (200ms delay)
→ Batch 2: 25000 rows updated (200ms delay)
→ Batch 3: 12847 rows updated (200ms delay)
→ Batch 4: 0 rows — complete
✓ 001-backfill-user-status.sql done (62847 rows)

# Run schema migrations forward
$ npx sluice migrate --folder=./migrations

# Run interleaved migrations + backfills
$ npx sluice run --migrations=./migrations --backfills=./backfills`,
    api: `import pgPromise from 'pg-promise';
import { runBackfills, runMigrations, runMigrationsAndBackfills } from '@dotbrains/sluice';

const pgp = pgPromise();
const db = pgp(process.env.DATABASE_URL);

// Run backfills only
await runBackfills({
  database: db,
  backfillsFolder: './backfills',
  gucs: ['myapp.is_backfill'],
  batchDelayMs: 200,
});

// Run interleaved migrations + backfills
await runMigrationsAndBackfills({
  database: db,
  migrationsFolder: './migrations',
  backfillsFolder: './backfills',
  gucs: ['myapp.is_backfill'],
});`,
    backfill: `-- @migration 050.do.add-status-column.sql

WITH batch AS (
  SELECT ctid FROM public.users
    WHERE status IS NULL
    ORDER BY ctid
    FOR UPDATE
    LIMIT 25000
)
UPDATE public.users SET status = 'active'
  FROM batch
  WHERE public.users.ctid = batch.ctid;`,
    interleave: `# Interleaved mode: migrate → backfill → migrate → backfill
$ npx sluice run --migrations=./migrations --backfills=./backfills
→ Migrating to 050...
→ Running backfill 050-backfill-user-status.sql...
→ Batch 1: 25000 rows (200ms delay)
→ Batch 2: 0 rows — complete
✓ 050-backfill-user-status.sql done
→ Migrating to 051...
→ Running backfill 051-backfill-org-defaults.sql...
→ Batch 1: 8200 rows (200ms delay)
→ Batch 2: 0 rows — complete
✓ 051-backfill-org-defaults.sql done
→ Migrating to 060...
✓ All migrations and backfills complete`,
    branch: `# Renumber branch migrations to avoid collisions
$ npx sluice renumber main --migrations=./migrations
→ Common ancestor: abc1234
→ Target max version: 055
→ Renumbering 050 → 056, 051 → 057
→ Updated @migration annotations in backfills
✓ 2 migrations renumbered

# Safely switch database to another branch
$ npx sluice switch feature-branch --migrations=./migrations
→ Common ancestor version: 045
→ Migrating down from 055 to 045...
→ Checking out feature-branch...
→ Migrating up to 052...
✓ Database switched to feature-branch`,
  };

  const tabs = [
    { key: 'cli' as const, label: 'CLI', language: 'bash' },
    { key: 'api' as const, label: 'API', language: 'typescript' },
    { key: 'backfill' as const, label: 'Backfill SQL', language: 'sql' },
    { key: 'interleave' as const, label: 'Interleave', language: 'bash' },
    { key: 'branch' as const, label: 'Branch Tools', language: 'bash' },
  ];

  return (
    <section id="code-examples" className="py-12 sm:py-16 lg:py-20 bg-dark-gray/50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10 sm:mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-cream mb-3 sm:mb-4">
            Code Examples
          </h2>
          <p className="text-cream/70 text-base sm:text-lg lg:text-xl max-w-3xl mx-auto">
            See sluice in action — CLI commands, TypeScript API, and SQL patterns
          </p>
        </div>
        <div className="bg-dark-slate border border-sluice-blue/30 rounded-xl overflow-hidden">
          <div className="flex border-b border-sluice-blue/30 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'bg-dark-gray/50 text-sluice-blue border-b-2 border-sluice-blue'
                    : 'text-cream/70 hover:text-cream hover:bg-dark-gray/30'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="p-4 sm:p-6 overflow-x-auto">
            <CodeBlock
              code={examples[activeTab]}
              language={tabs.find((t) => t.key === activeTab)?.language}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
