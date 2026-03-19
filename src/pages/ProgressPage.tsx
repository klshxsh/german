import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';

const BUCKET_INTERVALS = ['Now', '1 day', '3 days', '7 days', '14 days'];
const BUCKET_COLORS = ['#C0392B', '#E67E22', '#F1C40F', '#27AE60', '#2980B9'];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function modeLabel(mode: 'flashcard' | 'sentence-builder' | 'cloze'): string {
  if (mode === 'flashcard') return 'Flashcards';
  if (mode === 'sentence-builder') return 'Sentence Builder';
  return 'Cloze';
}

export default function ProgressPage() {
  const units = useLiveQuery(() => db.units.toArray(), []);
  const allProgress = useLiveQuery(() => db.flashcardProgress.toArray(), []);
  const allSessions = useLiveQuery(
    () => db.sessionLogs.orderBy('startedAt').reverse().toArray(),
    []
  );

  if (!units || !allProgress || !allSessions) {
    return (
      <div className="p-4 text-center" style={{ color: '#7A6855' }}>
        Loading…
      </div>
    );
  }

  // Overall stats
  const totalEntries = allProgress.length;
  const totalCorrect = allSessions.reduce((sum, s) => sum + s.correctAnswers, 0);
  const totalQuestions = allSessions.reduce((sum, s) => sum + s.totalQuestions, 0);
  const overallAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
  const sessionsCount = allSessions.length;

  // Bucket distribution per unit
  const progressByUnit = new Map<number, typeof allProgress>();
  for (const p of allProgress) {
    if (!progressByUnit.has(p.unitId)) progressByUnit.set(p.unitId, []);
    progressByUnit.get(p.unitId)!.push(p);
  }

  return (
    <div className="max-w-2xl mx-auto p-4 pb-8">
      <h1 className="text-2xl font-bold mb-6" style={{ color: '#2C2418' }}>
        Progress
      </h1>

      {/* Overall stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div
          className="rounded-xl p-4 text-center"
          style={{ backgroundColor: '#EDE8E0' }}
        >
          <div className="text-2xl font-bold" style={{ color: '#C4713B' }}>
            {totalEntries}
          </div>
          <div className="text-xs mt-1" style={{ color: '#7A6855' }}>
            Total Cards
          </div>
        </div>
        <div
          className="rounded-xl p-4 text-center"
          style={{ backgroundColor: '#EDE8E0' }}
        >
          <div className="text-2xl font-bold" style={{ color: '#C4713B' }}>
            {totalQuestions > 0 ? `${overallAccuracy}%` : '—'}
          </div>
          <div className="text-xs mt-1" style={{ color: '#7A6855' }}>
            Accuracy
          </div>
        </div>
        <div
          className="rounded-xl p-4 text-center"
          style={{ backgroundColor: '#EDE8E0' }}
        >
          <div className="text-2xl font-bold" style={{ color: '#C4713B' }}>
            {sessionsCount}
          </div>
          <div className="text-xs mt-1" style={{ color: '#7A6855' }}>
            Sessions
          </div>
        </div>
      </div>

      {/* Per-unit bucket breakdown */}
      {units.length === 0 ? (
        <p className="text-center mb-8" style={{ color: '#7A6855' }}>
          No units imported yet.
        </p>
      ) : (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4" style={{ color: '#2C2418' }}>
            Leitner Buckets by Unit
          </h2>
          <div className="space-y-4">
            {units.map((unit) => {
              const unitProgress = progressByUnit.get(unit.id!) ?? [];
              const bucketCounts = [0, 1, 2, 3, 4].map(
                (b) => unitProgress.filter((p) => p.bucket === b).length
              );
              const total = unitProgress.length;

              return (
                <div
                  key={unit.id}
                  className="rounded-xl p-4"
                  style={{ backgroundColor: '#EDE8E0' }}
                >
                  <div className="font-medium mb-3" style={{ color: '#2C2418' }}>
                    {unit.name}
                  </div>
                  {total === 0 ? (
                    <p className="text-sm" style={{ color: '#7A6855' }}>
                      No progress data
                    </p>
                  ) : (
                    <div>
                      {/* Stacked bar */}
                      <div className="flex rounded-full overflow-hidden h-4 mb-2" aria-label="bucket distribution">
                        {bucketCounts.map((count, i) =>
                          count > 0 ? (
                            <div
                              key={i}
                              style={{
                                width: `${(count / total) * 100}%`,
                                backgroundColor: BUCKET_COLORS[i],
                              }}
                              title={`Bucket ${i} (${BUCKET_INTERVALS[i]}): ${count}`}
                            />
                          ) : null
                        )}
                      </div>
                      {/* Legend */}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                        {bucketCounts.map((count, i) => (
                          <span
                            key={i}
                            className="text-xs flex items-center gap-1"
                            style={{ color: '#7A6855' }}
                          >
                            <span
                              className="inline-block w-2 h-2 rounded-full"
                              style={{ backgroundColor: BUCKET_COLORS[i] }}
                            />
                            B{i} ({count})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Session history */}
      <div>
        <h2 className="text-lg font-semibold mb-4" style={{ color: '#2C2418' }}>
          Session History
        </h2>
        {allSessions.length === 0 ? (
          <p className="text-center" style={{ color: '#7A6855' }}>
            No sessions yet.
          </p>
        ) : (
          <div className="space-y-2">
            {allSessions.map((session) => {
              const accuracy =
                session.totalQuestions > 0
                  ? Math.round((session.correctAnswers / session.totalQuestions) * 100)
                  : 0;
              const unit = units.find((u) => u.id === session.unitId);
              return (
                <div
                  key={session.id}
                  className="rounded-xl p-3 flex items-center justify-between"
                  style={{ backgroundColor: '#EDE8E0' }}
                >
                  <div>
                    <div className="font-medium text-sm" style={{ color: '#2C2418' }}>
                      {modeLabel(session.mode)}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: '#7A6855' }}>
                      {unit?.name ?? 'Unknown unit'} · {formatDate(session.startedAt)}{' '}
                      {formatTime(session.startedAt)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-sm" style={{ color: '#C4713B' }}>
                      {session.correctAnswers}/{session.totalQuestions}
                    </div>
                    <div className="text-xs" style={{ color: '#7A6855' }}>
                      {accuracy}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
