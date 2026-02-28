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

  const c00 = a0 * b0;
  const c01 = a0 * b1;
  const c10 = a1 * b0;
  const c11 = a1 * b1;

  const row0 = c00 + c01;
  const row1 = c10 + c11;
  const col0 = c00 + c10;
  const col1 = c01 + c11;
  const total = row0 + row1;

  return {
    decomposition: { a: [a0, a1], b: [b0, b1] },
    cells: {
      cell_r0c0: c00,
      cell_r0c1: c01,
      cell_r1c0: c10,
      cell_r1c1: c11
    },
    rowSums: [row0, row1],
    colSums: [col0, col1],
    total
  };
};

const buildStructuredQuestion = ({ id, taskKind, a, b, solution }) => {
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
    base.prompt = '영역모델의 빈 칸 값을 모두 채우세요.';
    base.answerSpec.inputs = [
      { id: 'cell_r0c0', kind: 'integer', solutionPath: 'cells.cell_r0c0' },
      { id: 'cell_r0c1', kind: 'integer', solutionPath: 'cells.cell_r0c1' },
      { id: 'cell_r1c0', kind: 'integer', solutionPath: 'cells.cell_r1c0' },
      { id: 'cell_r1c1', kind: 'integer', solutionPath: 'cells.cell_r1c1' }
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
    base.prompt = '행/열 부분합을 모두 채우세요.';
    base.answerSpec.inputs = [
      { id: 'row_sum_0', kind: 'integer', solutionPath: 'rowSums.0' },
      { id: 'row_sum_1', kind: 'integer', solutionPath: 'rowSums.1' },
      { id: 'col_sum_0', kind: 'integer', solutionPath: 'colSums.0' },
      { id: 'col_sum_1', kind: 'integer', solutionPath: 'colSums.1' }
    ];
    return base;
  }

  if (taskKind === 'mixed_process') {
    base.prompt = '빈 칸을 채워 계산 과정을 완성하세요.';
    base.answerSpec.inputs = [
      { id: 'cell_r0c1', kind: 'integer', solutionPath: 'cells.cell_r0c1' },
      { id: 'cell_r1c0', kind: 'integer', solutionPath: 'cells.cell_r1c0' },
      { id: 'row_sum_0', kind: 'integer', solutionPath: 'rowSums.0' },
      { id: 'col_sum_1', kind: 'integer', solutionPath: 'colSums.1' },
      { id: 'total', kind: 'integer', solutionKey: 'total' }
    ];
    return base;
  }

  throw new Error(`unsupported taskKind: ${taskKind}`);
};

const normalizeTaskKind = (taskKind) => {
  if (taskKind === 'partial_sum') return 'partial_sums';
  if (taskKind === 'decompose') return 'decompose_factors';
  return taskKind;
};

export const generatePlaceValueAreaModelQuestion = ({
  seed,
  min = DEFAULT_MIN,
  max = DEFAULT_MAX,
  taskKind = 'partial_cells',
  idPrefix = 'pvam'
} = {}) => {
  const rng = Number.isInteger(seed) ? createMulberry32(seed) : Math.random;

  let a = intInRange(rng, min, max);
  let b = intInRange(rng, min, max);

  // Keep the initial prototype focused on two-digit x two-digit.
  a = Math.min(99, Math.max(10, a));
  b = Math.min(99, Math.max(10, b));

  const normalizedTaskKind = normalizeTaskKind(taskKind);
  const solution = buildAreaModelSolution(a, b);
  const id = `${idPrefix}-${normalizedTaskKind}-${a}x${b}-${Number.isInteger(seed) ? seed : 'rand'}`;

  return buildStructuredQuestion({ id, taskKind: normalizedTaskKind, a, b, solution });
};

export const generatePlaceValueAreaModelBank = ({
  count = 10,
  seed = 1,
  taskKinds = ['decompose_factors', 'partial_cells', 'partial_sums', 'mixed_process', 'final_product']
} = {}) => {
  const questions = [];
  const baseSeed = Number.isInteger(seed) ? seed : 1;

  for (let i = 0; i < count; i += 1) {
    const taskKind = normalizeTaskKind(taskKinds[i % taskKinds.length] || 'partial_cells');
    questions.push(generatePlaceValueAreaModelQuestion({
      seed: baseSeed + i,
      taskKind
    }));
  }

  return { questions };
};
