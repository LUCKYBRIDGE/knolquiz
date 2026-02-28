const REQUIRED_HEADERS = ['문제 내용'];
const HEADER_ALIASES = new Map([
  ['문제내용', '문제 내용'],
  ['문항', '문제 내용'],
  ['문제', '문제 내용'],
  ['선택지1', '선택지1'],
  ['선택지2', '선택지2'],
  ['선택지3', '선택지3(선택)'],
  ['선택지4', '선택지4(선택)'],
  ['선택지3(선택)', '선택지3(선택)'],
  ['선택지4(선택)', '선택지4(선택)'],
  ['choices', '선택지(레거시)'],
  ['선택지', '선택지(레거시)'],
  ['answerindex', '정답번호'],
  ['정답번호', '정답번호'],
  ['정답 번호', '정답번호'],
  ['time', '문제시간(초)'],
  ['문제시간', '문제시간(초)'],
  ['문제시간(초)', '문제시간(초)'],
  ['문세시간(초)', '문제시간(초)'],
  ['문항시간(초)', '문제시간(초)'],
  ['정답인정단어', '정답인정단어'],
  ['인정단어', '정답인정단어'],
  ['acceptedanswers', '정답인정단어'],
  ['단어포함시정답처리여부', '단어포함시정답처리여부'],
  ['포함시정답처리여부', '단어포함시정답처리여부'],
  ['containsmatch', '단어포함시정답처리여부']
]);

const normalizeHeader = (header) => {
  const raw = String(header ?? '')
    .replace(/^\uFEFF/, '')
    .trim();
  if (!raw) return '';
  const compact = raw.toLowerCase().replace(/\s+/g, '');
  return HEADER_ALIASES.get(compact) || raw;
};

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        value += '"';
        i += 2;
        continue;
      }
      if (char === '"') {
        inQuotes = false;
        i += 1;
        continue;
      }
      value += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ',') {
      row.push(value);
      value = '';
      i += 1;
      continue;
    }
    if (char === '\n') {
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
      i += 1;
      continue;
    }
    if (char === '\r') {
      i += 1;
      continue;
    }
    value += char;
    i += 1;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => String(cell || '').trim().length > 0));
};

const parseAnswerIndex = (rawValue) => {
  const value = Number.parseInt(String(rawValue ?? '').trim(), 10);
  return Number.isFinite(value) ? value : NaN;
};

const parseAcceptedWords = (rawValue) => {
  const source = String(rawValue ?? '').trim();
  if (!source) return [];
  return source
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const parseContainsMatch = (rawValue) => {
  const normalized = String(rawValue ?? '').trim().toLowerCase();
  if (!normalized) return false;
  return normalized === 'y' || normalized === 'yes' || normalized === 'true' || normalized === '1';
};

const parseQuestionTimeSec = (rawValue) => {
  const text = String(rawValue ?? '').trim();
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return NaN;
  return Math.max(0, value);
};

export const parseCsvQuestionBank = (csvText) => {
  const rows = parseCsv(String(csvText ?? ''));
  if (!rows.length) {
    return { valid: false, errors: ['CSV가 비어 있습니다.'], bank: null };
  }

  const rawHeaders = rows[0] || [];
  const headers = rawHeaders.map((header) => normalizeHeader(header));
  const headerToIndex = new Map();
  headers.forEach((header, index) => {
    if (!header || headerToIndex.has(header)) return;
    headerToIndex.set(header, index);
  });

  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headerToIndex.has(header));
  if (missingHeaders.length) {
    return {
      valid: false,
      errors: [`필수 헤더 누락: ${missingHeaders.join(', ')}`],
      bank: null
    };
  }

  const errors = [];
  const warnings = [];
  const hasQuestionTimeHeader = headerToIndex.has('문제시간(초)');
  const hasLegacyChoicesHeader = headerToIndex.has('선택지(레거시)');
  const hasChoiceColumn1 = headerToIndex.has('선택지1');
  const hasChoiceColumn2 = headerToIndex.has('선택지2');
  const hasAnswerIndexHeader = headerToIndex.has('정답번호');
  const hasAcceptedWordsHeader = headerToIndex.has('정답인정단어');
  const hasContainsMatchHeader = headerToIndex.has('단어포함시정답처리여부');

  if (!hasChoiceColumn1 || !hasChoiceColumn2 || !hasAnswerIndexHeader) {
    warnings.push('권장 헤더(선택지1, 선택지2, 정답번호)가 없어서 일부 행이 오답 처리될 수 있습니다.');
  }
  if (!hasQuestionTimeHeader) {
    warnings.push('문제시간(초) 헤더가 없어 문제별 시간 제한은 사용하지 않습니다.');
  }
  if (!hasAcceptedWordsHeader) {
    warnings.push('정답인정단어 헤더가 없어 주관식 채점 규칙은 사용하지 않습니다.');
  }
  if (!hasContainsMatchHeader) {
    warnings.push('단어포함시정답처리여부 헤더가 없어 주관식은 기본값 N(완전 일치)로 채점됩니다.');
  }

  const questions = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const lineNo = rowIndex + 1;
    const questionText = String(row[headerToIndex.get('문제 내용')] ?? '').trim();
    const choice1 = String(row[headerToIndex.get('선택지1')] ?? '').trim();
    const choice2 = String(row[headerToIndex.get('선택지2')] ?? '').trim();
    const choice3 = String(row[headerToIndex.get('선택지3(선택)')] ?? '').trim();
    const choice4 = String(row[headerToIndex.get('선택지4(선택)')] ?? '').trim();
    const legacyChoiceRaw = String(row[headerToIndex.get('선택지(레거시)')] ?? '').trim();
    const rawAnswerIndex = row[headerToIndex.get('정답번호')] ?? '';
    const rawAcceptedWords = row[headerToIndex.get('정답인정단어')] ?? '';
    const rawContainsMatch = row[headerToIndex.get('단어포함시정답처리여부')] ?? '';
    const rawQuestionTime = hasQuestionTimeHeader
      ? row[headerToIndex.get('문제시간(초)')]
      : '';

    if (
      !questionText
      && !choice1
      && !choice2
      && !choice3
      && !choice4
      && !legacyChoiceRaw
      && !String(rawAnswerIndex).trim()
      && !String(rawAcceptedWords).trim()
    ) {
      continue;
    }

    if (!questionText) {
      errors.push(`${lineNo}행: 문제 내용이 비어 있습니다.`);
      continue;
    }

    const acceptedWords = parseAcceptedWords(rawAcceptedWords);
    const containsMatch = parseContainsMatch(rawContainsMatch);
    const timeLimitSec = hasQuestionTimeHeader ? parseQuestionTimeSec(rawQuestionTime) : null;
    if (hasQuestionTimeHeader && Number.isNaN(timeLimitSec)) {
      errors.push(`${lineNo}행: 문제시간(초)는 숫자여야 합니다.`);
      continue;
    }

    if (acceptedWords.length > 0) {
      const id = `csv-subjective-${String(questions.length + 1).padStart(4, '0')}`;
      const question = {
        id,
        type: 'csv_subjective',
        prompt: questionText,
        question: '',
        answer: acceptedWords[0],
        choices: [],
        difficulty: 1,
        tags: ['csv', 'subjective'],
        renderKind: 'text_short_answer',
        acceptedAnswers: acceptedWords,
        acceptedMatchContains: containsMatch
      };
      if (timeLimitSec != null) {
        question.timeLimitSec = timeLimitSec;
      }
      questions.push(question);
      continue;
    }

    let choices = [choice1, choice2, choice3, choice4].filter(Boolean);
    if (choices.length < 2 && hasLegacyChoicesHeader && legacyChoiceRaw) {
      choices = legacyChoiceRaw
        .split('|')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (choices.length < 2) {
      errors.push(`${lineNo}행: 객관식은 선택지1/선택지2(이상)가 필요합니다.`);
      continue;
    }

    const answerIndex = parseAnswerIndex(rawAnswerIndex);
    if (!Number.isFinite(answerIndex)) {
      errors.push(`${lineNo}행: 정답번호는 숫자여야 합니다.`);
      continue;
    }
    if (answerIndex < 1 || answerIndex > choices.length) {
      errors.push(`${lineNo}행: 정답번호(${answerIndex})가 선택지 범위를 벗어났습니다.`);
      continue;
    }

    const answer = choices[answerIndex - 1];
    const id = `csv-choice-${String(questions.length + 1).padStart(4, '0')}`;
    const question = {
      id,
      type: 'csv_choice',
      prompt: questionText,
      question: '',
      answer,
      choices,
      difficulty: 1,
      tags: ['csv', 'text-choice'],
      renderKind: 'text_choice'
    };
    if (timeLimitSec != null) {
      question.timeLimitSec = timeLimitSec;
    }
    questions.push(question);
  }

  if (!questions.length && !errors.length) {
    errors.push('CSV에 유효한 문제가 없습니다.');
  }

  if (errors.length) {
    return { valid: false, errors, warnings, bank: null };
  }

  return {
    valid: true,
    errors: [],
    warnings,
    bank: { questions }
  };
};
