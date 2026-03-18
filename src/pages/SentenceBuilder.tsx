import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { db } from '../db/db';
import { logSession } from '../db/progress';
import { tokenise } from '../logic/tokeniser';
import { getDistractors } from '../logic/distractor';
import { calculateSentenceScore, calculateSessionSummary, formatElapsedTime } from '../logic/scoring';
import type { Entry, GeneratedSentence } from '../types';

// ── Types ────────────────────────────────────────────────────────────────────

type Phase = 'config' | 'session' | 'summary';
type Complexity = 'simple' | 'compound' | 'complex' | 'mixed';
type CountOption = 5 | 10 | 15;

interface SessionConfig {
  complexity: Complexity;
  count: CountOption;
}

interface Tile {
  id: string;
  text: string;
  entryId: number | null;
}

interface SentenceQuestion {
  sentence: GeneratedSentence;
  correctTokens: Tile[];
  allTiles: Tile[]; // shuffled pool (correct + distractors)
}

interface QuestionState {
  answerTiles: Tile[];
  poolTiles: Tile[];
  attempts: number;
  checked: boolean;
  correct: boolean | null;
  score: number;
}

interface SessionResult {
  sentence: GeneratedSentence;
  score: number;
  maxScore: number;
}

interface ActiveSession {
  questions: SentenceQuestion[];
  currentIndex: number;
  questionState: QuestionState;
  results: SessionResult[];
  startedAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildInitialQuestionState(question: SentenceQuestion): QuestionState {
  return {
    answerTiles: [],
    poolTiles: [...question.allTiles],
    attempts: 0,
    checked: false,
    correct: null,
    score: 0,
  };
}

// ── Tile Component ────────────────────────────────────────────────────────────

interface TileProps {
  tile: Tile;
  inAnswer: boolean;
  onClick: () => void;
}

function SortableTile({ tile, inAnswer, onClick }: TileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tile.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const combinedStyle = {
    ...style,
    backgroundColor: inAnswer ? '#EDE8E0' : 'white',
    borderColor: '#D4C8B8',
    color: '#2C2418',
  };

  return (
    <button
      ref={setNodeRef}
      style={combinedStyle}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="px-3 py-2 rounded-lg text-sm font-medium border cursor-grab active:cursor-grabbing select-none min-h-[44px] touch-none"
      aria-label={`tile-${tile.text}`}
    >
      {tile.text}
    </button>
  );
}

function DragOverlayTile({ tile }: { tile: Tile }) {
  return (
    <div
      className="px-3 py-2 rounded-lg text-sm font-medium border select-none min-h-[44px] flex items-center"
      style={{
        backgroundColor: 'white',
        borderColor: '#C4713B',
        color: '#2C2418',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}
    >
      {tile.text}
    </div>
  );
}

function DroppableZone({ id, children, className, style }: {
  id: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} id={id} className={className} style={style}>
      {children}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SentenceBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const unitId = id ? parseInt(id, 10) : 0;

  const [phase, setPhase] = useState<Phase>('config');
  const [config, setConfig] = useState<SessionConfig>({ complexity: 'mixed', count: 5 });
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [noSentencesMessage, setNoSentencesMessage] = useState<string | null>(null);
  const [activeDragTile, setActiveDragTile] = useState<Tile | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function startSession() {
    setNoSentencesMessage(null);

    // Load sentences
    let sentences: GeneratedSentence[];
    if (config.complexity === 'mixed') {
      sentences = await db.generatedSentences.where('unitId').equals(unitId).toArray();
    } else {
      sentences = await db.generatedSentences
        .where('unitId')
        .equals(unitId)
        .and((s) => s.complexity === config.complexity)
        .toArray();
    }

    if (sentences.length === 0) {
      setNoSentencesMessage('No sentences found for the selected complexity.');
      return;
    }

    // Shuffle and take N
    const selected = shuffle(sentences).slice(0, config.count);

    // Load all entries for this unit
    const allEntries = await db.entries.where('unitId').equals(unitId).toArray();
    const entryMap = new Map(allEntries.map((e) => [e.id!, e]));

    // Build questions
    const questions: SentenceQuestion[] = selected.map((sentence, sIdx) => {
      const tokens = tokenise(sentence.german, allEntries);
      const correctTokens: Tile[] = tokens
        .filter((t) => /[a-zA-ZäöüÄÖÜß]/.test(t.text))
        .map((t, tIdx) => ({
          id: `tile_${sIdx}_${tIdx}`,
          text: t.text,
          entryId: t.entryId,
        }));

      // Get used entries for distractor generation
      const usedEntries: Entry[] = sentence.usedEntryIds
        .map((eid) => entryMap.get(eid))
        .filter((e): e is Entry => e !== undefined);

      const distractorEntries = getDistractors(usedEntries, allEntries, 3);
      const distractorTiles: Tile[] = distractorEntries.map((e, dIdx) => ({
        id: `distractor_${sIdx}_${dIdx}`,
        text: e.german,
        entryId: e.id ?? null,
      }));

      const allTiles = shuffle([...correctTokens, ...distractorTiles]);

      return { sentence, correctTokens, allTiles };
    });

    const firstQ = questions[0];
    setSession({
      questions,
      currentIndex: 0,
      questionState: buildInitialQuestionState(firstQ),
      results: [],
      startedAt: new Date().toISOString(),
    });
    setPhase('session');
  }

  function addToAnswer(tileId: string) {
    if (!session) return;
    const { questionState } = session;
    const tile = questionState.poolTiles.find((t) => t.id === tileId);
    if (!tile) return;
    setSession({
      ...session,
      questionState: {
        ...questionState,
        checked: false,
        correct: null,
        poolTiles: questionState.poolTiles.filter((t) => t.id !== tileId),
        answerTiles: [...questionState.answerTiles, tile],
      },
    });
  }

  function removeFromAnswer(tileId: string) {
    if (!session) return;
    const { questionState } = session;
    const tile = questionState.answerTiles.find((t) => t.id === tileId);
    if (!tile) return;
    setSession({
      ...session,
      questionState: {
        ...questionState,
        checked: false,
        correct: null,
        answerTiles: questionState.answerTiles.filter((t) => t.id !== tileId),
        poolTiles: [...questionState.poolTiles, tile],
      },
    });
  }

  function handleDragStart(event: DragStartEvent) {
    if (!session) return;
    const tileId = event.active.id as string;
    const { questionState } = session;
    const tile =
      questionState.poolTiles.find((t) => t.id === tileId) ??
      questionState.answerTiles.find((t) => t.id === tileId);
    setActiveDragTile(tile ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragTile(null);
    if (!session) return;

    const { active, over } = event;
    if (!over) return;

    const tileId = active.id as string;
    const overId = over.id as string;
    const { questionState } = session;

    const inPool = questionState.poolTiles.some((t) => t.id === tileId);
    const inAnswer = questionState.answerTiles.some((t) => t.id === tileId);
    const overPool = questionState.poolTiles.some((t) => t.id === overId) || overId === 'pool-zone';
    const overAnswer =
      questionState.answerTiles.some((t) => t.id === overId) || overId === 'answer-zone';

    if (inPool && overAnswer) {
      // Move from pool to answer
      const tile = questionState.poolTiles.find((t) => t.id === tileId)!;
      const overIndex = questionState.answerTiles.findIndex((t) => t.id === overId);
      let newAnswerTiles: Tile[];
      if (overIndex >= 0) {
        newAnswerTiles = [...questionState.answerTiles];
        newAnswerTiles.splice(overIndex, 0, tile);
      } else {
        newAnswerTiles = [...questionState.answerTiles, tile];
      }
      setSession({
        ...session,
        questionState: {
          ...questionState,
          checked: false,
          correct: null,
          poolTiles: questionState.poolTiles.filter((t) => t.id !== tileId),
          answerTiles: newAnswerTiles,
        },
      });
    } else if (inAnswer && overPool) {
      // Move from answer back to pool
      const tile = questionState.answerTiles.find((t) => t.id === tileId)!;
      setSession({
        ...session,
        questionState: {
          ...questionState,
          checked: false,
          correct: null,
          answerTiles: questionState.answerTiles.filter((t) => t.id !== tileId),
          poolTiles: [...questionState.poolTiles, tile],
        },
      });
    } else if (inAnswer && overAnswer && tileId !== overId) {
      // Reorder within answer zone
      const oldIdx = questionState.answerTiles.findIndex((t) => t.id === tileId);
      const newIdx = questionState.answerTiles.findIndex((t) => t.id === overId);
      if (oldIdx >= 0 && newIdx >= 0) {
        setSession({
          ...session,
          questionState: {
            ...questionState,
            checked: false,
            correct: null,
            answerTiles: arrayMove(questionState.answerTiles, oldIdx, newIdx),
          },
        });
      }
    }
  }

  function checkAnswer() {
    if (!session) return;
    const { questions, currentIndex, questionState } = session;
    const question = questions[currentIndex];

    const correctText = question.correctTokens.map((t) => t.text.toLowerCase()).join(' ');
    const answerText = questionState.answerTiles.map((t) => t.text.toLowerCase()).join(' ');
    const isCorrect = correctText === answerText;

    const newAttempts = questionState.attempts + 1;
    const score = calculateSentenceScore(newAttempts, isCorrect);

    setSession({
      ...session,
      questionState: {
        ...questionState,
        attempts: newAttempts,
        checked: true,
        correct: isCorrect,
        score: questionState.score + score,
      },
    });
  }

  async function nextQuestion() {
    if (!session) return;
    const { questions, currentIndex, questionState, results } = session;
    const question = questions[currentIndex];

    const newResults = [
      ...results,
      {
        sentence: question.sentence,
        score: questionState.score,
        maxScore: 2,
      },
    ];

    const nextIndex = currentIndex + 1;

    if (nextIndex >= questions.length) {
      // End of session
      const endedAt = new Date().toISOString();
      const correctAnswers = newResults.filter((r) => r.score > 0).length;

      await logSession({
        unitId,
        mode: 'sentence-builder',
        startedAt: session.startedAt,
        endedAt,
        totalQuestions: questions.length,
        correctAnswers,
        entryIds: questions.flatMap((q) =>
          q.sentence.usedEntryIds
        ),
      });

      setSession({ ...session, results: newResults });
      setPhase('summary');
    } else {
      const nextQuestion = questions[nextIndex];
      setSession({
        ...session,
        currentIndex: nextIndex,
        questionState: buildInitialQuestionState(nextQuestion),
        results: newResults,
      });
    }
  }

  // ── Config Screen ───────────────────────────────────────────────────────────

  if (phase === 'config') {
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
            Sentence Builder
          </h1>
        </header>

        {/* Complexity */}
        <section className="mb-6">
          <h2 className="font-semibold mb-3" style={{ color: '#2C2418' }}>
            Complexity
          </h2>
          <div className="space-y-2">
            {(
              [
                { value: 'mixed', label: 'Mixed' },
                { value: 'simple', label: 'Simple' },
                { value: 'compound', label: 'Compound' },
                { value: 'complex', label: 'Complex' },
              ] as const
            ).map(({ value, label }) => (
              <label
                key={value}
                className="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
                style={{ backgroundColor: 'white' }}
              >
                <input
                  type="radio"
                  name="complexity"
                  value={value}
                  checked={config.complexity === value}
                  onChange={() => setConfig((prev) => ({ ...prev, complexity: value }))}
                  className="w-5 h-5 accent-[#C4713B]"
                />
                <span style={{ color: '#2C2418' }}>{label}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Count */}
        <section className="mb-8">
          <h2 className="font-semibold mb-3" style={{ color: '#2C2418' }}>
            Number of sentences
          </h2>
          <select
            value={config.count}
            onChange={(e) =>
              setConfig((prev) => ({ ...prev, count: parseInt(e.target.value, 10) as CountOption }))
            }
            className="w-full p-3 rounded-xl border"
            style={{
              backgroundColor: 'white',
              borderColor: '#D4C8B8',
              color: '#2C2418',
            }}
            aria-label="Number of sentences"
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={15}>15</option>
          </select>
        </section>

        {noSentencesMessage && (
          <p className="mb-4 text-sm text-center" style={{ color: '#C0392B' }}>
            {noSentencesMessage}
          </p>
        )}

        <button
          onClick={startSession}
          className="w-full py-4 rounded-xl font-semibold text-white min-h-[56px]"
          style={{ backgroundColor: '#C4713B' }}
        >
          Start Session
        </button>
      </div>
    );
  }

  // ── Session Screen ──────────────────────────────────────────────────────────

  if (phase === 'session' && session) {
    const { questions, currentIndex, questionState } = session;
    const question = questions[currentIndex];
    const total = questions.length;
    const current = currentIndex + 1;
    const progressPct = ((current - 1) / total) * 100;

    const answerIds = questionState.answerTiles.map((t) => t.id);
    const poolIds = questionState.poolTiles.map((t) => t.id);

    const feedbackBg =
      questionState.checked && questionState.correct !== null
        ? questionState.correct
          ? '#5B8C5A'
          : '#C0392B'
        : undefined;

    return (
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-4">
          {/* Top bar */}
          <div className="flex items-center gap-3 mb-4">
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
                <span>Q {current} of {total}</span>
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

          {/* English translation */}
          <div
            className="rounded-xl p-4 mb-3"
            style={{ backgroundColor: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
          >
            <p className="text-xs font-medium mb-1" style={{ color: '#7A6855' }}>
              Translate to German:
            </p>
            <p className="text-lg font-semibold" style={{ color: '#2C2418' }}>
              {question.sentence.english}
            </p>
          </div>

          {/* Answer zone */}
          <div className="mb-3">
            <p className="text-sm font-medium mb-2" style={{ color: '#7A6855' }}>
              Your answer:
            </p>
            <SortableContext items={answerIds} strategy={horizontalListSortingStrategy}>
              <DroppableZone
                id="answer-zone"
                className="min-h-[60px] rounded-xl border-2 border-dashed p-3 flex flex-wrap gap-2 transition-colors"
                style={{
                  borderColor: feedbackBg ?? '#D4C8B8',
                  backgroundColor: feedbackBg ? `${feedbackBg}18` : '#F6F1EB',
                }}
              >
                {questionState.answerTiles.length === 0 && (
                  <p className="text-sm" style={{ color: '#7A6855' }}>
                    Drop tiles here or click tiles below…
                  </p>
                )}
                {questionState.answerTiles.map((tile) => (
                  <SortableTile
                    key={tile.id}
                    tile={tile}
                    inAnswer={true}
                    onClick={() => removeFromAnswer(tile.id)}
                  />
                ))}
              </DroppableZone>
            </SortableContext>

            {/* Feedback message */}
            {questionState.checked && questionState.correct !== null && (
              <div className="mt-2">
                {questionState.correct ? (
                  <p className="text-sm font-medium" style={{ color: '#5B8C5A' }}>
                    Correct!
                  </p>
                ) : (
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#C0392B' }}>
                      Not quite. The correct answer is:
                    </p>
                    <p className="text-sm mt-1 font-semibold" style={{ color: '#2C2418' }}>
                      {question.correctTokens.map((t) => t.text).join(' ')}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tile pool */}
          <div className="mb-4">
            <p className="text-sm font-medium mb-2" style={{ color: '#7A6855' }}>
              Available tiles:
            </p>
            <SortableContext items={poolIds} strategy={horizontalListSortingStrategy}>
              <DroppableZone
                id="pool-zone"
                className="min-h-[60px] rounded-xl p-3 flex flex-wrap gap-2"
                style={{ backgroundColor: '#EDE8E0' }}
              >
                {questionState.poolTiles.map((tile) => (
                  <SortableTile
                    key={tile.id}
                    tile={tile}
                    inAnswer={false}
                    onClick={() => addToAnswer(tile.id)}
                  />
                ))}
              </DroppableZone>
            </SortableContext>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            {!questionState.checked ? (
              <button
                onClick={checkAnswer}
                disabled={questionState.answerTiles.length === 0}
                className="flex-1 py-4 rounded-xl font-semibold text-white min-h-[56px] disabled:opacity-50"
                style={{ backgroundColor: '#C4713B' }}
              >
                Check
              </button>
            ) : (
              <button
                onClick={nextQuestion}
                className="flex-1 py-4 rounded-xl font-semibold text-white min-h-[56px]"
                style={{ backgroundColor: '#C4713B' }}
              >
                {currentIndex + 1 >= questions.length ? 'See Results' : 'Next'}
              </button>
            )}
          </div>
        </div>

        <DragOverlay>
          {activeDragTile ? <DragOverlayTile tile={activeDragTile} /> : null}
        </DragOverlay>
      </DndContext>
    );
  }

  // ── Summary Screen ──────────────────────────────────────────────────────────

  if (phase === 'summary' && session) {
    const { results, startedAt } = session;
    const totalScore = results.reduce((sum, r) => sum + r.score, 0);
    const maxScore = results.reduce((sum, r) => sum + r.maxScore, 0);
    const correctAnswers = results.filter((r) => r.score > 0).length;
    const endedAt = new Date().toISOString();
    const summary = calculateSessionSummary(
      results.length,
      correctAnswers,
      startedAt,
      endedAt
    );

    return (
      <div className="max-w-2xl mx-auto px-4 pt-8 pb-4">
        <h1 className="text-2xl font-bold mb-2" style={{ color: '#2C2418' }}>
          Session Complete!
        </h1>

        {/* Score */}
        <div
          className="rounded-xl p-4 mb-6 text-center"
          style={{ backgroundColor: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        >
          <p className="text-4xl font-bold mb-1" style={{ color: '#C4713B' }}>
            {totalScore} / {maxScore}
          </p>
          <p className="text-sm" style={{ color: '#7A6855' }}>
            points
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="rounded-xl p-4 text-center" style={{ backgroundColor: 'white' }}>
            <p className="text-2xl font-bold" style={{ color: '#5B8C5A' }}>
              {correctAnswers}
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#7A6855' }}>
              Correct
            </p>
          </div>
          <div className="rounded-xl p-4 text-center" style={{ backgroundColor: 'white' }}>
            <p className="text-2xl font-bold" style={{ color: '#C4713B' }}>
              {summary.accuracyPercent}%
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#7A6855' }}>
              Accuracy
            </p>
          </div>
          <div className="rounded-xl p-4 text-center" style={{ backgroundColor: 'white' }}>
            <p className="text-2xl font-bold" style={{ color: '#2C2418' }}>
              {formatElapsedTime(summary.elapsedMs)}
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#7A6855' }}>
              Time
            </p>
          </div>
        </div>

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
