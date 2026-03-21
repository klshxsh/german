import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import { logSession } from '../db/progress';
import { generateClozeQuestion, type BlankType, type ClozeQuestion } from '../logic/cloze';
import { isAcceptableAnswer } from '../logic/levenshtein';
import { calculateSessionSummary, formatElapsedTime } from '../logic/scoring';
import { initAudio, playCorrect, playIncorrect, playComplete } from '../logic/sounds';
import type { Entry } from '../types';

// ── Types ────────────────────────────────────────────────────────────────────

type Phase = 'config' | 'session' | 'summary';
type Mode = 'multiple-choice' | 'free-type';
type CountOption = 10 | 20 | 50;

interface SessionConfig {
  blankType: BlankType;
  mode: Mode;
  count: CountOption;
}

interface QuestionState {
  question: ClozeQuestion;
  answered: boolean;
  isCorrect: boolean | null;
  userAnswer: string;
}

interface SessionResult {
  question: ClozeQuestion;
  userAnswer: string;
  correct: boolean;
}

interface ActiveSession {
  questions: ClozeQuestion[];
  currentIndex: number;
  questionState: QuestionState;
  results: SessionResult[];
  startedAt: string;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ClozeSession() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const unitId = id ? parseInt(id, 10) : 0;

  const [phase, setPhase] = useState<Phase>('config');
  const [config, setConfig] = useState<SessionConfig>({
    blankType: 'mixed',
    mode: 'multiple-choice',
    count: 10,
  });
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [noQuestionsMessage, setNoQuestionsMessage] = useState<string | null>(null);
  const [freeTypeInput, setFreeTypeInput] = useState('');

  // Auto-advance timer ref
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    };
  }, []);

  function buildInitialQuestionState(question: ClozeQuestion): QuestionState {
    return { question, answered: false, isCorrect: null, userAnswer: '' };
  }

  async function startSession() {
    initAudio();
    setNoQuestionsMessage(null);

    const sentences = await db.generatedSentences.where('unitId').equals(unitId).toArray();
    if (sentences.length === 0) {
      setNoQuestionsMessage('No sentences found for this unit.');
      return;
    }

    const allEntries = await db.entries.where('unitId').equals(unitId).toArray();
    const entryMap = new Map<number, Entry>(allEntries.map((e) => [e.id!, e]));

    // Shuffle sentences and try to build questions
    const shuffled = [...sentences].sort(() => Math.random() - 0.5);
    const questions: ClozeQuestion[] = [];

    for (const sentence of shuffled) {
      if (questions.length >= config.count) break;
      const usedEntries = sentence.usedEntryIds
        .map((eid) => entryMap.get(eid))
        .filter((e): e is Entry => e !== undefined);

      const q = generateClozeQuestion(sentence, usedEntries, allEntries, config.blankType);
      if (q) questions.push(q);
    }

    if (questions.length === 0) {
      setNoQuestionsMessage('Could not generate questions for the selected settings.');
      return;
    }

    setSession({
      questions,
      currentIndex: 0,
      questionState: buildInitialQuestionState(questions[0]),
      results: [],
      startedAt: new Date().toISOString(),
    });
    setFreeTypeInput('');
    setPhase('session');
  }

  function handleMultipleChoice(selected: string) {
    if (!session || session.questionState.answered) return;
    const { questionState } = session;
    const isCorrect = selected === questionState.question.correctAnswer;

    const newState: QuestionState = {
      ...questionState,
      answered: true,
      isCorrect,
      userAnswer: selected,
    };

    setSession({ ...session, questionState: newState });

    if (isCorrect) {
      playCorrect();
      autoAdvanceTimer.current = setTimeout(() => {
        advanceQuestion(session.results, newState, session.questions, session.currentIndex, session.startedAt);
      }, 1500);
    } else {
      playIncorrect();
    }
  }

  function handleFreeTypeSubmit() {
    if (!session || session.questionState.answered || !freeTypeInput.trim()) return;
    const { questionState } = session;
    const isCorrect = isAcceptableAnswer(freeTypeInput.trim(), questionState.question.correctAnswer);

    const newState: QuestionState = {
      ...questionState,
      answered: true,
      isCorrect,
      userAnswer: freeTypeInput.trim(),
    };

    setSession({ ...session, questionState: newState });

    if (isCorrect) {
      playCorrect();
      autoAdvanceTimer.current = setTimeout(() => {
        advanceQuestion(session.results, newState, session.questions, session.currentIndex, session.startedAt);
      }, 1500);
    } else {
      playIncorrect();
    }
  }

  async function advanceQuestion(
    prevResults: SessionResult[],
    answeredState: QuestionState,
    questions: ClozeQuestion[],
    currentIndex: number,
    startedAt: string
  ) {
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    }

    const newResults: SessionResult[] = [
      ...prevResults,
      {
        question: answeredState.question,
        userAnswer: answeredState.userAnswer,
        correct: answeredState.isCorrect === true,
      },
    ];

    const nextIndex = currentIndex + 1;

    if (nextIndex >= questions.length) {
      const endedAt = new Date().toISOString();
      const correctAnswers = newResults.filter((r) => r.correct).length;
      await logSession({
        unitId,
        mode: 'cloze',
        startedAt,
        endedAt,
        totalQuestions: questions.length,
        correctAnswers,
        entryIds: questions.flatMap((q) => q.entryIds),
      });

      playComplete();
      setSession((prev) =>
        prev ? { ...prev, results: newResults, currentIndex: nextIndex } : null
      );
      setPhase('summary');
    } else {
      setFreeTypeInput('');
      setSession((prev) =>
        prev
          ? {
              ...prev,
              currentIndex: nextIndex,
              questionState: buildInitialQuestionState(questions[nextIndex]),
              results: newResults,
            }
          : null
      );
    }
  }

  function handleNext() {
    if (!session) return;
    advanceQuestion(
      session.results,
      session.questionState,
      session.questions,
      session.currentIndex,
      session.startedAt
    );
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold" style={{ color: '#2C2418' }}>
            Cloze Tests
          </h1>
        </header>

        {/* Blank type */}
        <section className="mb-6">
          <h2 className="font-semibold mb-3" style={{ color: '#2C2418' }}>
            What to blank
          </h2>
          <div className="space-y-2">
            {(
              [
                { value: 'mixed', label: 'Mixed' },
                { value: 'vocabulary', label: 'Vocabulary' },
                { value: 'verbs', label: 'Verbs' },
                { value: 'qualifiers', label: 'Qualifiers' },
                { value: 'connectives', label: 'Connectives' },
              ] as const
            ).map(({ value, label }) => (
              <label
                key={value}
                className="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
                style={{ backgroundColor: 'white' }}
              >
                <input
                  type="radio"
                  name="blankType"
                  value={value}
                  checked={config.blankType === value}
                  onChange={() => setConfig((prev) => ({ ...prev, blankType: value }))}
                  className="w-5 h-5 accent-[#C4713B]"
                />
                <span style={{ color: '#2C2418' }}>{label}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Mode */}
        <section className="mb-6">
          <h2 className="font-semibold mb-3" style={{ color: '#2C2418' }}>
            Answer mode
          </h2>
          <div className="space-y-2">
            {(
              [
                { value: 'multiple-choice', label: 'Multiple choice (4 options)' },
                { value: 'free-type', label: 'Free typing' },
              ] as const
            ).map(({ value, label }) => (
              <label
                key={value}
                className="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
                style={{ backgroundColor: 'white' }}
              >
                <input
                  type="radio"
                  name="mode"
                  value={value}
                  checked={config.mode === value}
                  onChange={() => setConfig((prev) => ({ ...prev, mode: value }))}
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
            Number of questions
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
            aria-label="Number of questions"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </section>

        {noQuestionsMessage && (
          <p className="mb-4 text-sm text-center" style={{ color: '#C0392B' }}>
            {noQuestionsMessage}
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
    const { question, answered, isCorrect } = questionState;
    const total = questions.length;
    const current = currentIndex + 1;
    const progressPct = ((current - 1) / total) * 100;

    const feedbackColor =
      answered && isCorrect !== null ? (isCorrect ? '#5B8C5A' : '#C0392B') : undefined;

    return (
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-4">
        {/* Top bar */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => {
              if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
              setPhase('config');
            }}
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
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
                style={{ width: `${progressPct}%`, backgroundColor: '#C4713B' }}
              />
            </div>
          </div>
        </div>

        {/* Sentence with blank */}
        <div
          className="rounded-xl p-4 mb-3"
          style={{
            backgroundColor: 'white',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            borderLeft: feedbackColor ? `4px solid ${feedbackColor}` : undefined,
          }}
        >
          <p className="text-xs font-medium mb-2" style={{ color: '#7A6855' }}>
            Fill in the blank:
          </p>
          <p className="text-lg font-semibold" style={{ color: '#2C2418' }}>
            {question.sentenceWithBlank}
          </p>
          <p className="text-sm mt-2" style={{ color: '#7A6855' }}>
            {question.englishHint}
          </p>
        </div>

        {/* Answer area */}
        <div className="mb-4">
          {config.mode === 'multiple-choice' ? (
            <div className="grid grid-cols-2 gap-3">
              {question.options.map((option, idx) => {
                let bgColor = 'white';
                let borderColor = '#D4C8B8';
                let textColor = '#2C2418';

                if (answered) {
                  if (option === question.correctAnswer) {
                    bgColor = '#EBF5EA';
                    borderColor = '#5B8C5A';
                    textColor = '#5B8C5A';
                  } else if (option === questionState.userAnswer && !isCorrect) {
                    bgColor = '#FDECEA';
                    borderColor = '#C0392B';
                    textColor = '#C0392B';
                  }
                }

                return (
                  <button
                    key={idx}
                    onClick={() => handleMultipleChoice(option)}
                    disabled={answered}
                    className="p-3 rounded-xl border-2 text-sm font-medium min-h-[52px] transition-colors disabled:cursor-default"
                    style={{ backgroundColor: bgColor, borderColor, color: textColor }}
                    aria-label={`option-${option}`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          ) : (
            <div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={freeTypeInput}
                  onChange={(e) => setFreeTypeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !answered) handleFreeTypeSubmit();
                  }}
                  disabled={answered}
                  placeholder="Type your answer…"
                  className="flex-1 p-3 rounded-xl border text-sm"
                  style={{
                    backgroundColor: 'white',
                    borderColor: feedbackColor ?? '#D4C8B8',
                    color: '#2C2418',
                  }}
                  aria-label="Free type answer"
                />
                <button
                  onClick={handleFreeTypeSubmit}
                  disabled={answered || !freeTypeInput.trim()}
                  className="px-4 py-3 rounded-xl font-semibold text-white min-h-[48px] disabled:opacity-50"
                  style={{ backgroundColor: '#C4713B' }}
                >
                  Submit
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Feedback */}
        {answered && isCorrect !== null && (
          <div className="mb-4">
            {isCorrect ? (
              <p className="text-sm font-medium" style={{ color: '#5B8C5A' }}>
                Correct! {isCorrect && config.mode === 'free-type' && questionState.userAnswer.toLowerCase() !== question.correctAnswer.toLowerCase()
                  ? `(accepted — close enough to "${question.correctAnswer}")`
                  : ''}
              </p>
            ) : (
              <div>
                <p className="text-sm font-medium" style={{ color: '#C0392B' }}>
                  Not quite.
                </p>
                <p className="text-sm mt-1" style={{ color: '#2C2418' }}>
                  Correct answer: <span className="font-semibold">{question.correctAnswer}</span>
                </p>
              </div>
            )}
          </div>
        )}

        {/* Next button (only for incorrect answers) */}
        {answered && !isCorrect && (
          <button
            onClick={handleNext}
            className="w-full py-4 rounded-xl font-semibold text-white min-h-[56px]"
            style={{ backgroundColor: '#C4713B' }}
          >
            {currentIndex + 1 >= questions.length ? 'See Results' : 'Next'}
          </button>
        )}

        {/* Auto-advance indicator */}
        {answered && isCorrect && (
          <p className="text-center text-sm" style={{ color: '#7A6855' }}>
            Advancing…
          </p>
        )}
      </div>
    );
  }

  // ── Summary Screen ──────────────────────────────────────────────────────────

  if (phase === 'summary' && session) {
    const { results, startedAt } = session;
    const correctAnswers = results.filter((r) => r.correct).length;
    const endedAt = new Date().toISOString();
    const summary = calculateSessionSummary(results.length, correctAnswers, startedAt, endedAt);

    const missedResults = results.filter((r) => !r.correct);

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
            {correctAnswers} / {results.length}
          </p>
          <p className="text-sm" style={{ color: '#7A6855' }}>
            correct
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-6">
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

        {/* Missed items */}
        {missedResults.length > 0 && (
          <div className="mb-6">
            <h2 className="font-semibold mb-3" style={{ color: '#2C2418' }}>
              Review missed answers
            </h2>
            <div className="space-y-2">
              {missedResults.map((r, idx) => (
                <div
                  key={idx}
                  className="rounded-xl p-3"
                  style={{ backgroundColor: 'white', borderLeft: '3px solid #C0392B' }}
                >
                  <p className="text-sm" style={{ color: '#7A6855' }}>
                    {r.question.sentenceWithBlank}
                  </p>
                  <p className="text-sm mt-1">
                    <span style={{ color: '#7A6855' }}>Answer: </span>
                    <span className="font-semibold" style={{ color: '#2C2418' }}>
                      {r.question.correctAnswer}
                    </span>
                    {r.userAnswer && (
                      <span style={{ color: '#C0392B' }}> (you said: {r.userAnswer})</span>
                    )}
                  </p>
                </div>
              ))}
            </div>
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
