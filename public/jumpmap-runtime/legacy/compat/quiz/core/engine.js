import { buildRandomQueue, cloneWithShuffledChoices } from './selection.js';
import { computeScore } from './scoring.js';
import { createEventBus } from './events.js';

const clampTotalQuestions = (settings, totalQuestions) => {
  if (settings.selectionMode === 'sequential' || settings.avoidRepeat) {
    return Math.min(settings.questionCount, totalQuestions);
  }
  return settings.questionCount;
};

export const createQuizEngine = ({ questionBank, settings }) => {
  const { emit, on } = createEventBus();
  const questions = questionBank.questions.slice();
  const shouldLoop = settings.quizEndMode === 'time' || settings.loopQuestions;
  const totalLimit = shouldLoop
    ? Number.POSITIVE_INFINITY
    : clampTotalQuestions(settings, questions.length);

  const buildQueue = () => (
    settings.selectionMode === 'random' && settings.avoidRepeat
      ? buildRandomQueue(questions)
      : questions.slice()
  );

  let queue = buildQueue();
  let index = 0;
  let askedCount = 0;
  let answeredCount = 0;
  let correctCount = 0;
  let totalScore = 0;
  let combo = 0;
  let currentQuestion;
  let questionStartTime = 0;

  const refillQueue = () => {
    queue = buildQueue();
    index = 0;
  };

  const getNextFromQueue = () => {
    if (!questions.length) return undefined;
    if (settings.selectionMode === 'random') {
      if (settings.avoidRepeat) {
        if (!queue.length) {
          if (!shouldLoop) return undefined;
          refillQueue();
        }
        return queue.shift();
      }
      if (!queue.length) {
        if (!shouldLoop) return undefined;
        refillQueue();
      }
      return queue[Math.floor(Math.random() * queue.length)];
    }
    if (index >= queue.length) {
      if (!shouldLoop) return undefined;
      index = 0;
    }
    const next = queue[index];
    index += 1;
    return next;
  };

  const reset = () => {
    queue = buildQueue();
    index = 0;
    askedCount = 0;
    answeredCount = 0;
    correctCount = 0;
    totalScore = 0;
    combo = 0;
    currentQuestion = undefined;
    questionStartTime = 0;
  };

  const nextQuestion = () => {
    if (Number.isFinite(totalLimit) && askedCount >= totalLimit) return null;
    const next = getNextFromQueue();
    if (!next) return null;
    askedCount += 1;
    currentQuestion = settings.shuffleChoices ? cloneWithShuffledChoices(next) : { ...next };
    questionStartTime = Date.now();
    emit({ type: 'question', payload: currentQuestion });
    return currentQuestion;
  };

  const submitAnswer = (choice) => {
    if (!currentQuestion) return null;
    const timeMs = Math.max(0, Date.now() - questionStartTime);
    const correct = choice === currentQuestion.answer;
    const { scoreDelta, nextCombo } = computeScore(correct, timeMs, combo, settings);

    totalScore += scoreDelta;
    combo = nextCombo;
    answeredCount += 1;
    if (correct) correctCount += 1;

    const result = {
      correct,
      timeMs,
      questionId: currentQuestion.id,
      scoreDelta,
      totalScore,
      combo,
      difficulty: currentQuestion.difficulty
    };

    emit({ type: 'answer', payload: result });

    if (Number.isFinite(totalLimit) && answeredCount >= totalLimit) {
      emit({ type: 'finish', payload: { totalScore, correctCount, totalCount: answeredCount } });
    }

    currentQuestion = undefined;
    return result;
  };

  const getState = () => ({
    settings,
    totalScore,
    combo,
    answeredCount,
    correctCount,
    currentQuestion,
    remainingQuestions: Number.isFinite(totalLimit)
      ? Math.max(0, totalLimit - answeredCount)
      : 0
  });

  return {
    nextQuestion,
    submitAnswer,
    getState,
    reset,
    onEvent: on
  };
};
