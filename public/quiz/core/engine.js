import { buildRandomQueue, cloneWithShuffledChoices } from './selection.js';
import { computeScore } from './scoring.js';
import { createEventBus } from './events.js';
import { gradePlaceValueAreaModelQuestion } from './graders/place-value-area-model.js';

const isStructuredQuestion = (question) => (
  question?.interactionKind === 'structured'
  || (question?.schemaVersion === 2 && typeof question?.questionKind === 'string')
);

const gradeQuestionAnswer = (question, answerInput) => {
  if (question?.renderKind === 'text_short_answer') {
    const userAnswer = String(answerInput ?? '').trim();
    const acceptedAnswers = Array.isArray(question?.acceptedAnswers)
      ? question.acceptedAnswers
          .map((value) => String(value ?? '').trim())
          .filter(Boolean)
      : [];
    const containsMatch = Boolean(question?.acceptedMatchContains);
    if (!acceptedAnswers.length) {
      return {
        correct: false,
        answerKind: 'short_answer',
        wrongFields: [],
        graderErrors: ['acceptedAnswers is empty for short_answer question']
      };
    }
    const normalizedUser = userAnswer.toLowerCase();
    const correct = containsMatch
      ? acceptedAnswers.some((word) => normalizedUser.includes(word.toLowerCase()))
      : acceptedAnswers.some((word) => normalizedUser === word.toLowerCase());
    return {
      correct,
      answerKind: 'short_answer'
    };
  }
  if (isStructuredQuestion(question)) {
    if (question?.questionKind === 'place_value_area_model') {
      return gradePlaceValueAreaModelQuestion(question, answerInput);
    }
    return {
      correct: false,
      answerKind: 'structured',
      wrongFields: [],
      graderErrors: [`unsupported structured questionKind: ${String(question?.questionKind || '')}`]
    };
  }
  return {
    correct: answerInput === question.answer,
    answerKind: 'choice'
  };
};

const clampTotalQuestions = (settings, totalQuestions) => {
  if (settings.selectionMode === 'sequential' || settings.avoidRepeat) {
    return Math.min(settings.questionCount, totalQuestions);
  }
  return settings.questionCount;
};

const resolveQuestionTimeLimitSec = (question) => {
  const raw = question?.timeLimitSec;
  if (raw == null || raw === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, parsed);
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
  let currentQuestionTimeLimitSec = null;

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
    currentQuestionTimeLimitSec = null;
  };

  const nextQuestion = () => {
    if (Number.isFinite(totalLimit) && askedCount >= totalLimit) return null;
    const next = getNextFromQueue();
    if (!next) return null;
    askedCount += 1;
    currentQuestion = (settings.shuffleChoices && Array.isArray(next.choices))
      ? cloneWithShuffledChoices(next)
      : { ...next };
    currentQuestionTimeLimitSec = resolveQuestionTimeLimitSec(currentQuestion);
    questionStartTime = Date.now();
    emit({ type: 'question', payload: currentQuestion });
    return currentQuestion;
  };

  const submitAnswer = (answerInput) => {
    if (!currentQuestion) return null;
    const timeMs = Math.max(0, Date.now() - questionStartTime);
    const gradingResult = gradeQuestionAnswer(currentQuestion, answerInput);
    const correct = gradingResult.correct;
    const scoringSettings = currentQuestionTimeLimitSec == null
      ? settings
      : { ...settings, timeLimitSec: currentQuestionTimeLimitSec };
    const { scoreDelta, nextCombo } = computeScore(correct, timeMs, combo, scoringSettings);

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
      difficulty: currentQuestion.difficulty,
      answerKind: gradingResult.answerKind,
      questionTimeLimitSec: currentQuestionTimeLimitSec
    };
    if (gradingResult.answerKind === 'structured') {
      result.wrongFields = gradingResult.wrongFields || [];
      if (Array.isArray(gradingResult.graderErrors) && gradingResult.graderErrors.length) {
        result.graderErrors = gradingResult.graderErrors.slice();
      }
    } else if (gradingResult.answerKind === 'short_answer') {
      if (Array.isArray(gradingResult.graderErrors) && gradingResult.graderErrors.length) {
        result.graderErrors = gradingResult.graderErrors.slice();
      }
    }

    emit({ type: 'answer', payload: result });

    if (Number.isFinite(totalLimit) && answeredCount >= totalLimit) {
      emit({ type: 'finish', payload: { totalScore, correctCount, totalCount: answeredCount } });
    }

    currentQuestion = undefined;
    currentQuestionTimeLimitSec = null;
    return result;
  };

  const getState = () => ({
    settings,
    totalScore,
    combo,
    answeredCount,
    correctCount,
    currentQuestion,
    currentQuestionTimeLimitSec,
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
