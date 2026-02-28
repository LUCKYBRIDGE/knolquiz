const isPlainObject = (value) => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const normalizeIntegerLike = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!/^[+-]?\d+$/.test(trimmed)) return trimmed;
  return Number.parseInt(trimmed, 10);
};

const normalizeScalarForComparison = (value, inputKind, grading) => {
  const kind = inputKind || (typeof value === 'number' ? 'integer' : 'string');
  const normalizeIntegerString = grading?.normalizeIntegerString !== false;
  const allowWhitespace = grading?.allowWhitespace !== false;

  if (kind === 'integer' && normalizeIntegerString) {
    return normalizeIntegerLike(value);
  }

  if (typeof value === 'string' && allowWhitespace) {
    return value.trim();
  }
  return value;
};

const flattenSolutionLeaves = (value, prefix = '', out = new Map()) => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      const nextPrefix = prefix ? `${prefix}.${index}` : `${index}`;
      flattenSolutionLeaves(entry, nextPrefix, out);
    });
    return out;
  }
  if (isPlainObject(value)) {
    Object.entries(value).forEach(([key, entry]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      flattenSolutionLeaves(entry, nextPrefix, out);
    });
    return out;
  }
  if (prefix) {
    out.set(prefix, value);
    const leafKey = prefix.includes('.') ? prefix.split('.').pop() : prefix;
    if (leafKey && !out.has(leafKey)) out.set(leafKey, value);
  }
  return out;
};

const buildExpectedInputMap = (question) => {
  const inputs = question?.answerSpec?.inputs;
  const solution = question?.solution;
  const errors = [];
  if (!Array.isArray(inputs) || !isPlainObject(solution)) {
    return { expectedByInput: new Map(), errors: ['missing answerSpec.inputs or solution'] };
  }

  const flattened = flattenSolutionLeaves(solution);
  const expectedByInput = new Map();

  inputs.forEach((input, index) => {
    const inputId = String(input?.id || '').trim();
    if (!inputId) {
      errors.push(`answerSpec.inputs[${index}].id is required`);
      return;
    }

    const solutionPath = typeof input.solutionPath === 'string' ? input.solutionPath.trim() : '';
    const solutionKey = typeof input.solutionKey === 'string' ? input.solutionKey.trim() : '';

    let expected;
    let found = false;

    if (isPlainObject(solution.inputs) && Object.prototype.hasOwnProperty.call(solution.inputs, inputId)) {
      expected = solution.inputs[inputId];
      found = true;
    } else if (solutionPath && flattened.has(solutionPath)) {
      expected = flattened.get(solutionPath);
      found = true;
    } else if (solutionKey && flattened.has(solutionKey)) {
      expected = flattened.get(solutionKey);
      found = true;
    } else if (flattened.has(inputId)) {
      expected = flattened.get(inputId);
      found = true;
    } else if (Object.prototype.hasOwnProperty.call(solution, inputId)) {
      expected = solution[inputId];
      found = true;
    }

    if (!found) {
      errors.push(`solution value not found for input '${inputId}'`);
      return;
    }

    expectedByInput.set(inputId, expected);
  });

  return { expectedByInput, errors };
};

export const gradePlaceValueAreaModelQuestion = (question, answerInput) => {
  const grading = isPlainObject(question?.grading) ? question.grading : {};
  const inputs = Array.isArray(question?.answerSpec?.inputs) ? question.answerSpec.inputs : [];

  if (!isPlainObject(answerInput)) {
    return {
      correct: false,
      answerKind: 'structured',
      wrongFields: inputs.map((input) => input?.id).filter(Boolean),
      graderErrors: ['structured answer must be an object']
    };
  }

  const { expectedByInput, errors } = buildExpectedInputMap(question);
  const wrongFields = [];

  inputs.forEach((input) => {
    const inputId = String(input?.id || '').trim();
    if (!inputId || !expectedByInput.has(inputId)) return;
    const expected = expectedByInput.get(inputId);
    const actual = answerInput[inputId];
    const normalizedExpected = normalizeScalarForComparison(expected, input?.kind, grading);
    const normalizedActual = normalizeScalarForComparison(actual, input?.kind, grading);
    if (normalizedExpected !== normalizedActual) {
      wrongFields.push(inputId);
    }
  });

  return {
    correct: errors.length === 0 && wrongFields.length === 0,
    answerKind: 'structured',
    wrongFields,
    graderErrors: errors
  };
};

