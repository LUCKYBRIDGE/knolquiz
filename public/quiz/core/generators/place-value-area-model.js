const DEFAULT_MIN = 11;
const DEFAULT_MAX = 99;

const intInRange = (rng, min, max) => (
  Math.floor(rng() * (max - min + 1)) + min
);

const createMulberry32 = (seed) => {
  let t = (seed >>> 0) || 1;
  return () => {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
};

const decomposeTensOnes = (value) => {
  const tens = Math.floor(value / 10) * 10;
  const ones = value % 10;
  return [tens, ones];
};

const buildAreaModelSolution = (a, b) => {
  const [a0, a1] = decomposeTensOnes(a);
  const [b0, b1] = decomposeTensOnes(b);
  // Always align to vertical multiplication partial products:
  // A x (tens + ones) => A x tens + A x ones
  // e.g. 50x13 => 50x10 + 50x3, 42x20 => 42x20 + 42x0.
  const row0 = a * b0;
  const row1 = a * b1;
  const total = row0 + row1;

  return {
    decomposition: { a: [a0, a1], b: [b0, b1] },
    cells: {
      cell_r0c0: row0,
      cell_r0c1: row1,
      cell_r1c0: 0,
      cell_r1c1: 0
    },
    rowSums: [row0, row1],
    colSums: [row0, row1],
    total
  };
};

const buildSingleMissingInput = (targetId) => {
  if (targetId === 'row_sum_0') {
    return { id: 'row_sum_0', kind: 'integer', solutionPath: 'rowSums.0' };
  }
  if (targetId === 'total') {
    return { id: 'total', kind: 'integer', solutionKey: 'total' };
  }
  return { id: 'row_sum_1', kind: 'integer', solutionPath: 'rowSums.1' };
};

const countCarriesFor2x2 = (a, b) => {
  const aT = Math.floor(a / 10);
  const aO = a % 10;
  const bT = Math.floor(b / 10);
  const bO = b % 10;

  let carries = 0;
  const row1Prod = aO * bO;
  const row1Carry1 = Math.floor(row1Prod / 10);
  if (row1Carry1 > 0) carries += 1;
  const row1Tens = (aT * bO) + row1Carry1;
  const row1Carry2 = Math.floor(row1Tens / 10);
  if (row1Carry2 > 0) carries += 1;

  const row2Prod = aO * bT;
  const row2Carry1 = Math.floor(row2Prod / 10);
  if (row2Carry1 > 0) carries += 1;
  const row2Tens = (aT * bT) + row2Carry1;
  const row2Carry2 = Math.floor(row2Tens / 10);
  if (row2Carry2 > 0) carries += 1;

  const row1Ones = row1Prod % 10;
  const row1TensDigit = row1Tens % 10;
  const row1Hundreds = row1Carry2;

  const row2Ones = row2Prod % 10;
  const row2TensDigit = row2Tens % 10;
  const row2Hundreds = row2Carry2;

  const sumTens = row1TensDigit + row2Ones;
  const sumCarry1 = Math.floor(sumTens / 10);
  if (sumCarry1 > 0) carries += 1;

  const sumHundreds = row1Hundreds + row2TensDigit + sumCarry1;
  const sumCarry2 = Math.floor(sumHundreds / 10);
  if (sumCarry2 > 0) carries += 1;

  const sumThousands = row2Hundreds + sumCarry2;
  if (sumThousands >= 10) carries += 1;

  return carries;
};

const matchesCarryMode = (carryCount, carryMode) => {
  if (carryMode === 'none') return carryCount === 0;
  if (carryMode === 'low') return carryCount >= 1 && carryCount <= 2;
  if (carryMode === 'high') return carryCount >= 3;
  return true;
};

const buildStructuredQuestion = ({
  id,
  taskKind,
  a,
  b,
  solution,
  singleMissingTarget = 'row_sum_1'
}) => {
  const base = {
    id,
    schemaVersion: 2,
    type: 'arithmetic',
    questionKind: 'place_value_area_model',
    interactionKind: 'structured',
    taskKind,
    difficulty: 'basic',
    tags: ['multiplication', 'place-value', 'area-model', '2digitx2digit'],
    prompt: '',
    question: `${a} x ${b}`,
    stem: {
      operator: 'multiply',
      factors: [a, b],
      decomposition: solution.decomposition
    },
    answerSpec: { inputs: [] },
    solution: {
      decomposition: {
        a: solution.decomposition.a.slice(),
        b: solution.decomposition.b.slice()
      },
      cells: { ...solution.cells },
      rowSums: solution.rowSums.slice(),
      colSums: solution.colSums.slice(),
      total: solution.total
    },
    grading: {
      mode: 'exact',
      allowWhitespace: true,
      normalizeIntegerString: true
    }
  };

  if (taskKind === 'final_product') {
    base.prompt = '곱의 값을 구하세요.';
    base.answerSpec.inputs = [
      { id: 'total', kind: 'integer', solutionKey: 'total' }
    ];
    return base;
  }

  if (taskKind === 'partial_cells') {
    base.prompt = '영역모델(2칸)의 부분곱을 채우세요.';
    base.answerSpec.inputs = [
      { id: 'row_sum_0', kind: 'integer', solutionPath: 'rowSums.0' },
      { id: 'row_sum_1', kind: 'integer', solutionPath: 'rowSums.1' }
    ];
    return base;
  }

  if (taskKind === 'decompose_factors') {
    base.prompt = '곱셈식을 자릿값으로 분해해 쓰세요.';
    base.answerSpec.inputs = [
      { id: 'decomp_a_0', kind: 'integer', solutionPath: 'decomposition.a.0' },
      { id: 'decomp_a_1', kind: 'integer', solutionPath: 'decomposition.a.1' },
      { id: 'decomp_b_0', kind: 'integer', solutionPath: 'decomposition.b.0' },
      { id: 'decomp_b_1', kind: 'integer', solutionPath: 'decomposition.b.1' }
    ];
    return base;
  }

  if (taskKind === 'partial_sums') {
    base.prompt = '세로셈의 부분곱 2줄을 채우세요.';
    base.answerSpec.inputs = [
      { id: 'row_sum_0', kind: 'integer', solutionPath: 'rowSums.0' },
      { id: 'row_sum_1', kind: 'integer', solutionPath: 'rowSums.1' }
    ];
    return base;
  }

  if (taskKind === 'mixed_process') {
    base.prompt = '분해식, 부분곱, 최종곱의 빈 칸을 채우세요.';
    base.answerSpec.inputs = [
      { id: 'decomp_a_0', kind: 'integer', solutionPath: 'decomposition.a.0' },
      { id: 'decomp_a_1', kind: 'integer', solutionPath: 'decomposition.a.1' },
      { id: 'row_sum_0', kind: 'integer', solutionPath: 'rowSums.0' },
      { id: 'row_sum_1', kind: 'integer', solutionPath: 'rowSums.1' },
      { id: 'total', kind: 'integer', solutionKey: 'total' }
    ];
    return base;
  }

  if (taskKind === 'single_missing') {
    base.prompt = '세로셈의 세 칸 중 빈칸 1개를 채우세요.';
    const target = ['row_sum_1', 'row_sum_0', 'total'].includes(singleMissingTarget)
      ? singleMissingTarget
      : 'row_sum_1';
    base.stem.singleMissingTarget = target;
    base.answerSpec.inputs = [buildSingleMissingInput(target)];
    return base;
  }

  throw new Error(`unsupported taskKind: ${taskKind}`);
};

const normalizeTaskKind = (taskKind) => {
  if (taskKind === 'partial_sum') return 'partial_sums';
  if (taskKind === 'decompose') return 'decompose_factors';
  if (taskKind === 'single') return 'single_missing';
  return taskKind;
};

export const generatePlaceValueAreaModelQuestion = ({
  seed,
  min = DEFAULT_MIN,
  max = DEFAULT_MAX,
  taskKind = 'partial_cells',
  idPrefix = 'pvam',
  carryMode = 'any',
  maxTries = 200
} = {}) => {
  const rng = Number.isInteger(seed) ? createMulberry32(seed) : Math.random;

  let a = intInRange(rng, min, max);
  let b = intInRange(rng, min, max);

  // Keep the initial prototype focused on two-digit x two-digit.
  a = Math.min(99, Math.max(10, a));
  b = Math.min(99, Math.max(10, b));
  let tries = 0;
  const normalizedCarryMode = ['none', 'low', 'high', 'any'].includes(carryMode) ? carryMode : 'any';

  while (tries < maxTries) {
    const carryCount = countCarriesFor2x2(a, b);
    if (matchesCarryMode(carryCount, normalizedCarryMode)) {
      break;
    }
    tries += 1;
    a = intInRange(rng, min, max);
    b = intInRange(rng, min, max);
    a = Math.min(99, Math.max(10, a));
    b = Math.min(99, Math.max(10, b));
  }

  const normalizedTaskKind = normalizeTaskKind(taskKind);
  const solution = buildAreaModelSolution(a, b);
  const id = `${idPrefix}-${normalizedTaskKind}-${a}x${b}-${Number.isInteger(seed) ? seed : 'rand'}`;
  const singleMissingTarget = ['row_sum_1', 'row_sum_0', 'total'][intInRange(rng, 0, 2)];
  return buildStructuredQuestion({
    id,
    taskKind: normalizedTaskKind,
    a,
    b,
    solution,
    singleMissingTarget
  });
};

export const generatePlaceValueAreaModelBank = ({
  count = 10,
  seed = 1,
  min = DEFAULT_MIN,
  max = DEFAULT_MAX,
  taskKinds = ['single_missing'],
  carryMode = 'any'
} = {}) => {
  const questions = [];
  const baseSeed = Number.isInteger(seed) ? seed : 1;

  for (let i = 0; i < count; i += 1) {
    const taskKind = normalizeTaskKind(taskKinds[i % taskKinds.length] || 'partial_cells');
    questions.push(generatePlaceValueAreaModelQuestion({
      seed: baseSeed + i,
      min,
      max,
      taskKind,
      carryMode
    }));
  }

  return { questions };
};
