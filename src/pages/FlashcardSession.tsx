import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { getProgressForUnit, updateProgress, logSession } from '../db/progress';
import { applyAnswer, getDueCards } from '../logic/leitner';
import { calculateSessionSummary, formatElapsedTime } from '../logic/scoring';
import type { Entry, FlashcardProgress } from '../types';

type Phase = 'config' | 'session' | 'summary';
type Direction = 'de-en' | 'en-de' | 'mixed';
type CountOption = 10 | 20 | 50 | 'all' | 'due';
type Strategy = 'random' | 'weakest' | 'due';

interface SessionConfig {
  selectedCategoryIds: Set<number>;
  direction: Direction;
  count: CountOption;
  strategy: Strategy;
}

interface CardItem {
  entry: Entry;
  progress: FlashcardProgress | undefined;
  showGerman: boolean;
}

interface SessionResult {
  entry: Entry;
  correct: boolean;
}

interface ActiveSession {
  cards: CardItem[];
  currentIndex: number;
  isFlipped: boolean;
  results: SessionResult[];
  startedAt: string;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function FlashcardSession() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const unitId = id ? parseInt(id, 10) : 0;

  const [phase, setPhase] = useState<Phase>('config');
  const [config, setConfig] = useState<SessionConfig>({
    selectedCategoryIds: new Set(),
    direction: 'de-en',
    count: 10,
    strategy: 'random',
  });
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [noCardsMessage, setNoCardsMessage] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const categories = useLiveQuery(
    () => (unitId ? db.categories.where('unitId').equals(unitId).toArray() : []),
    [unitId]
  );

  // Initialize all categories as selected when they first load
  useEffect(() => {
    if (categories && categories.length > 0 && !initialized) {
      setConfig((prev) => ({
        ...prev,
        selectedCategoryIds: new Set(categories.map((c) => c.id!)),
      }));
      setInitialized(true);
    }
  }, [categories, initialized]);

  async function buildCards(
    entriesOverride?: Entry[]
  ): Promise<CardItem[] | null> {
    const progressList = await getProgressForUnit(unitId);
    const progressMap = new Map(progressList.map((p) => [p.entryId, p]));

    let selected: Entry[];

    if (entriesOverride) {
      selected = entriesOverride;
    } else {
      const allEntries = await db.entries
        .where('unitId')
        .equals(unitId)
        .toArray();
      const filtered =
        config.selectedCategoryIds.size > 0
          ? allEntries.filter((e) => config.selectedCategoryIds.has(e.categoryId))
          : allEntries;

      if (config.count === 'due' || config.strategy === 'due') {
        const relevantProgress = progressList.filter((p) =>
          filtered.some((e) => e.id === p.entryId)
        );
        const dueProgress = getDueCards(relevantProgress);
        selected = dueProgress
          .map((p) => filtered.find((e) => e.id === p.entryId))
          .filter((e): e is Entry => e !== undefined);
      } else if (config.strategy === 'weakest') {
        selected = [...filtered].sort((a, b) => {
          const pa = progressMap.get(a.id!);
          const pb = progressMap.get(b.id!);
          const totalA = pa ? pa.correctCount + pa.incorrectCount : 0;
          const totalB = pb ? pb.correctCount + pb.incorrectCount : 0;
          const ratioA = totalA > 0 ? pa!.correctCount / totalA : 0;
          const ratioB = totalB > 0 ? pb!.correctCount / totalB : 0;
          return ratioA - ratioB;
        });
      } else {
        selected = shuffle(filtered);
      }

      if (
        config.count !== 'all' &&
        config.count !== 'due' &&
        typeof config.count === 'number'
      ) {
        selected = selected.slice(0, config.count);
      }
    }

    if (selected.length === 0) return null;

    return selected.map((entry) => {
      let showGerman: boolean;
      if (config.direction === 'de-en') showGerman = true;
      else if (config.direction === 'en-de') showGerman = false;
      else showGerman = Math.random() < 0.5;

      return {
        entry,
        progress: progressMap.get(entry.id!),
        showGerman,
      };
    });
  }

  async function startSession(entriesOverride?: Entry[]) {
    setNoCardsMessage(null);
    const cards = await buildCards(entriesOverride);
    if (!cards) {
      setNoCardsMessage(
        config.count === 'due' || config.strategy === 'due'
          ? 'No cards are due for review right now.'
          : 'No entries found for the selected categories.'
      );
      return;
    }
    setSession({
      cards,
      currentIndex: 0,
      isFlipped: false,
      results: [],
      startedAt: new Date().toISOString(),
    });
    setPhase('session');
  }

  function handleFlip() {
    setSession((prev) => (prev ? { ...prev, isFlipped: true } : prev));
  }

  async function handleAnswer(correct: boolean) {
    if (!session || !session.isFlipped) return;

    const currentCard = session.cards[session.currentIndex];

    if (currentCard.progress) {
      const updated = applyAnswer(currentCard.progress, correct);
      await updateProgress(updated);
    }

    const newResults = [
      ...session.results,
      { entry: currentCard.entry, correct },
    ];
    const nextIndex = session.currentIndex + 1;

    if (nextIndex >= session.cards.length) {
      const endedAt = new Date().toISOString();
      const correctCount = newResults.filter((r) => r.correct).length;
      await logSession({
        unitId,
        mode: 'flashcard',
        startedAt: session.startedAt,
        endedAt,
        totalQuestions: session.cards.length,
        correctAnswers: correctCount,
        entryIds: session.cards
          .map((c) => c.entry.id)
          .filter((id): id is number => id !== undefined),
      });
      setSession({ ...session, results: newResults });
      setPhase('summary');
    } else {
      setSession({
        ...session,
        results: newResults,
        currentIndex: nextIndex,
        isFlipped: false,
      });
    }
  }

  async function handlePracticeMissed() {
    if (!session) return;
    const missedEntries = session.results
      .filter((r) => !r.correct)
      .map((r) => r.entry);
    await startSession(missedEntries);
  }

  function toggleCategory(catId: number) {
    setConfig((prev) => {
      const next = new Set(prev.selectedCategoryIds);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return { ...prev, selectedCategoryIds: next };
    });
  }

  // ── Config Screen ──────────────────────────────────────────────────
  if (phase === 'config') {
    const canStart =
      config.selectedCategoryIds.size > 0 && (categories?.length ?? 0) > 0;

    return (
      <div className="max-w-2xl mx-auto px-4 pt-8 pb-4">
        <header className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate(`/unit/${unitId}`)}
            className="p-2 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
            style={{ backgroundColor: '#EDE8E0' }}
            aria-label="Go back"
          >
            <svg
              className="w-5 h-5"
              style={{ color: '#2C2418' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <h1 className="text-2xl font-bold" style={{ color: '#2C2418' }}>
            Flashcards
          </h1>
        </header>

        {/* Categories */}
        <section className="mb-6">
          <h2 className="font-semibold mb-3" style={{ color: '#2C2418' }}>
            Categories
          </h2>
          {!categories ? (
            <p style={{ color: '#7A6855' }}>Loading…</p>
          ) : (
            <div className="space-y-2">
              {categories.map((cat) => (
                <label
                  key={cat.id}
                  className="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
                  style={{ backgroundColor: 'white' }}
                >
                  <input
                    type="checkbox"
                    checked={config.selectedCategoryIds.has(cat.id!)}
                    onChange={() => toggleCategory(cat.id!)}
                    className="w-5 h-5 accent-[#C4713B]"
                    aria-label={cat.name}
                  />
                  <span style={{ color: '#2C2418' }}>{cat.name}</span>
                </label>
              ))}
            </div>
          )}
        </section>

        {/* Direction */}
        <section className="mb-6">
          <h2 className="font-semibold mb-3" style={{ color: '#2C2418' }}>
            Direction
          </h2>
          <div className="space-y-2">
            {(
              [
                { value: 'de-en', label: 'German → English' },
                { value: 'en-de', label: 'English → German' },
                { value: 'mixed', label: 'Mixed' },
              ] as const
            ).map(({ value, label }) => (
              <label
                key={value}
                className="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
                style={{ backgroundColor: 'white' }}
              >
                <input
                  type="radio"
                  name="direction"
                  value={value}
                  checked={config.direction === value}
                  onChange={() =>
                    setConfig((prev) => ({ ...prev, direction: value }))
                  }
                  className="w-5 h-5 accent-[#C4713B]"
                />
                <span style={{ color: '#2C2418' }}>{label}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Count */}
        <section className="mb-6">
          <h2 className="font-semibold mb-3" style={{ color: '#2C2418' }}>
            Number of cards
          </h2>
          <select
            value={String(config.count)}
            onChange={(e) => {
              const v = e.target.value;
              const count: CountOption =
                v === 'all'
                  ? 'all'
                  : v === 'due'
                    ? 'due'
                    : (parseInt(v, 10) as 10 | 20 | 50);
              setConfig((prev) => ({ ...prev, count }));
            }}
            className="w-full p-3 rounded-xl border"
            style={{
              backgroundColor: 'white',
              borderColor: '#D4C8B8',
              color: '#2C2418',
            }}
            aria-label="Number of cards"
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="all">All</option>
            <option value="due">Due for review</option>
          </select>
        </section>

        {/* Strategy */}
        <section className="mb-8">
          <h2 className="font-semibold mb-3" style={{ color: '#2C2418' }}>
            Selection strategy
          </h2>
          <select
            value={config.strategy}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                strategy: e.target.value as Strategy,
              }))
            }
            className="w-full p-3 rounded-xl border"
            style={{
              backgroundColor: 'white',
              borderColor: '#D4C8B8',
              color: '#2C2418',
            }}
            aria-label="Selection strategy"
          >
            <option value="random">Random</option>
            <option value="weakest">Weakest first</option>
            <option value="due">Due for review (Leitner)</option>
          </select>
        </section>

        {noCardsMessage && (
          <p className="mb-4 text-sm text-center" style={{ color: '#C0392B' }}>
            {noCardsMessage}
          </p>
        )}

        <button
          onClick={() => startSession()}
          disabled={!canStart}
          className="w-full py-4 rounded-xl font-semibold text-white min-h-[56px] disabled:opacity-50"
          style={{ backgroundColor: '#C4713B' }}
        >
          Start Session
        </button>
      </div>
    );
  }

  // ── Session Screen ─────────────────────────────────────────────────
  if (phase === 'session' && session) {
    const currentCard = session.cards[session.currentIndex];
    const total = session.cards.length;
    const current = session.currentIndex + 1;
    const progressPct = ((current - 1) / total) * 100;

    const frontText = currentCard.showGerman
      ? currentCard.entry.german
      : currentCard.entry.english;
    const backPrimaryText = currentCard.showGerman
      ? currentCard.entry.english
      : currentCard.entry.german;
    const backHintText = currentCard.showGerman
      ? currentCard.entry.german
      : currentCard.entry.english;

    return (
      <div className="max-w-2xl mx-auto px-4 pt-8 pb-4 flex flex-col min-h-screen">
        {/* Top bar */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setPhase('config')}
            className="p-2 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
            style={{ backgroundColor: '#EDE8E0' }}
            aria-label="Go back"
          >
            <svg
              className="w-5 h-5"
              style={{ color: '#2C2418' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <div className="flex-1">
            <div className="flex justify-between text-sm mb-1" style={{ color: '#7A6855' }}>
              <span>Card {current} of {total}</span>
              <span>{session.results.filter((r) => r.correct).length} correct</span>
            </div>
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: '#EDE8E0' }}
              role="progressbar"
              aria-valuenow={current - 1}
              aria-valuemin={0}
              aria-valuemax={total}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${progressPct}%`,
                  backgroundColor: '#C4713B',
                }}
              />
            </div>
          </div>
        </div>

        {/* Flashcard */}
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <div
            style={{ perspective: '1000px', width: '100%', maxWidth: '480px' }}
            onClick={!session.isFlipped ? handleFlip : undefined}
          >
            <div
              style={{
                transformStyle: 'preserve-3d',
                transition: 'transform 0.4s ease',
                transform: session.isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                position: 'relative',
                height: '240px',
                cursor: session.isFlipped ? 'default' : 'pointer',
              }}
            >
              {/* Front */}
              <div
                style={{
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: 'white',
                  borderRadius: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '24px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                }}
              >
                <p
                  className="text-3xl font-bold text-center mb-4"
                  style={{ color: '#2C2418' }}
                >
                  {frontText}
                </p>
                <p className="text-sm" style={{ color: '#7A6855' }}>
                  Tap to reveal
                </p>
              </div>

              {/* Back */}
              <div
                style={{
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: 'white',
                  borderRadius: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '24px',
                  transform: 'rotateY(180deg)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                }}
              >
                <p className="text-sm mb-2" style={{ color: '#7A6855' }}>
                  {backHintText}
                </p>
                <p
                  className="text-3xl font-bold text-center mb-2"
                  style={{ color: '#2C2418' }}
                >
                  {backPrimaryText}
                </p>
                {currentCard.entry.grammarNotes && (
                  <p className="text-xs text-center mt-2" style={{ color: '#7A6855' }}>
                    {currentCard.entry.grammarNotes}
                  </p>
                )}
                {currentCard.entry.partOfSpeech && (
                  <span
                    className="mt-3 text-xs px-2 py-1 rounded-full"
                    style={{ backgroundColor: '#EDE8E0', color: '#7A6855' }}
                  >
                    {currentCard.entry.partOfSpeech}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Answer buttons */}
          {session.isFlipped && (
            <div className="flex gap-4 w-full max-w-[480px]">
              <button
                onClick={() => handleAnswer(false)}
                className="flex-1 py-4 rounded-xl font-semibold min-h-[56px]"
                style={{ backgroundColor: '#C0392B', color: 'white' }}
              >
                Missed it
              </button>
              <button
                onClick={() => handleAnswer(true)}
                className="flex-1 py-4 rounded-xl font-semibold min-h-[56px]"
                style={{ backgroundColor: '#5B8C5A', color: 'white' }}
              >
                Got it
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Summary Screen ─────────────────────────────────────────────────
  if (phase === 'summary' && session) {
    const results = session.results;
    const correctCount = results.filter((r) => r.correct).length;
    const totalCount = results.length;
    const endedAt = new Date().toISOString();
    const summary = calculateSessionSummary(
      totalCount,
      correctCount,
      session.startedAt,
      endedAt
    );
    const missedCards = results.filter((r) => !r.correct);

    return (
      <div className="max-w-2xl mx-auto px-4 pt-8 pb-4">
        <h1 className="text-2xl font-bold mb-2" style={{ color: '#2C2418' }}>
          Session Complete!
        </h1>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div
            className="rounded-xl p-4 text-center"
            style={{ backgroundColor: 'white' }}
          >
            <p className="text-2xl font-bold" style={{ color: '#5B8C5A' }}>
              {correctCount}
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#7A6855' }}>
              Correct
            </p>
          </div>
          <div
            className="rounded-xl p-4 text-center"
            style={{ backgroundColor: 'white' }}
          >
            <p
              className="text-2xl font-bold"
              style={{ color: '#C4713B' }}
            >
              {summary.accuracyPercent}%
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#7A6855' }}>
              Accuracy
            </p>
          </div>
          <div
            className="rounded-xl p-4 text-center"
            style={{ backgroundColor: 'white' }}
          >
            <p className="text-2xl font-bold" style={{ color: '#2C2418' }}>
              {formatElapsedTime(summary.elapsedMs)}
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#7A6855' }}>
              Time
            </p>
          </div>
        </div>

        {/* Missed cards */}
        {missedCards.length > 0 && (
          <div className="mb-6">
            <h2 className="font-semibold mb-3" style={{ color: '#2C2418' }}>
              Missed cards ({missedCards.length})
            </h2>
            <div className="space-y-2">
              {missedCards.map((r) => (
                <div
                  key={r.entry.id}
                  className="rounded-xl p-3 flex justify-between"
                  style={{ backgroundColor: 'white' }}
                >
                  <span className="font-medium" style={{ color: '#2C2418' }}>
                    {r.entry.german}
                  </span>
                  <span style={{ color: '#7A6855' }}>{r.entry.english}</span>
                </div>
              ))}
            </div>

            <button
              onClick={handlePracticeMissed}
              className="w-full mt-4 py-3 rounded-xl font-semibold min-h-[48px]"
              style={{ backgroundColor: '#C4713B', color: 'white' }}
            >
              Practice missed cards
            </button>
          </div>
        )}

        <button
          onClick={() => navigate(`/unit/${unitId}`)}
          className="w-full py-3 rounded-xl font-semibold min-h-[48px]"
          style={{ backgroundColor: '#EDE8E0', color: '#2C2418' }}
        >
          Back to unit
        </button>
      </div>
    );
  }

  return null;
}
