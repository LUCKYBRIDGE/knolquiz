const decomposeTensOnes = (value) => {
  const tens = Math.floor(Number(value || 0) / 10) * 10;
  const ones = Number(value || 0) % 10;
  return [tens, ones];
};

const getStemFactors = (question) => {
  const factors = question?.stem?.factors;
  if (Array.isArray(factors) && factors.length >= 2) {
    return [Number(factors[0]) || 0, Number(factors[1]) || 0];
  }
  const match = String(question?.question || '').match(/(-?\d+)\s*x\s*(-?\d+)/i);
  if (match) {
    return [Number.parseInt(match[1], 10), Number.parseInt(match[2], 10)];
  }
  return [0, 0];
};

const getDecomposition = (question, factors) => {
  const decomp = question?.stem?.decomposition;
  if (decomp?.a?.length >= 2 && decomp?.b?.length >= 2) {
    return {
      a: [Number(decomp.a[0]) || 0, Number(decomp.a[1]) || 0],
      b: [Number(decomp.b[0]) || 0, Number(decomp.b[1]) || 0]
    };
  }
  return {
    a: decomposeTensOnes(factors[0]),
    b: decomposeTensOnes(factors[1])
  };
};

const getInputSpecsById = (question) => {
  const map = new Map();
  const inputs = Array.isArray(question?.answerSpec?.inputs) ? question.answerSpec.inputs : [];
  inputs.forEach((input) => {
    const id = String(input?.id || '').trim();
    if (!id) return;
    map.set(id, input);
  });
  return map;
};

const createEl = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (typeof text === 'string') el.textContent = text;
  return el;
};

const createNumberInput = ({ id, placeholder }) => {
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.className = 'pvam-input';
  input.dataset.structuredInput = id;
  input.placeholder = placeholder || '';
  input.setAttribute('aria-label', id);
  return input;
};

const createCellInputOrValue = ({ id, inputSpecs, solutionValue }) => {
  if (inputSpecs.has(id)) {
    return createNumberInput({ id, placeholder: '?' });
  }
  return createEl('div', 'pvam-static', String(solutionValue ?? '?'));
};

const hasAnyInput = (inputSpecs, ids) => ids.some((id) => inputSpecs.has(id));

const appendLabeledInputOrStatic = ({
  parent,
  label,
  id,
  inputSpecs,
  value
}) => {
  const row = createEl('div', 'pvam-total-row');
  row.appendChild(createEl('span', 'pvam-total-label', label));
  if (inputSpecs.has(id)) {
    row.appendChild(createNumberInput({ id, placeholder: '?' }));
  } else {
    row.appendChild(createEl('div', 'pvam-static pvam-total-static', String(value ?? '?')));
  }
  parent.appendChild(row);
};

export const isPlaceValueAreaModelQuestion = (question) => (
  question?.interactionKind === 'structured'
  && question?.questionKind === 'place_value_area_model'
);

export const renderPlaceValueAreaModelQuestion = ({ choicesEl, question, onSubmit }) => {
  if (!choicesEl || !isPlaceValueAreaModelQuestion(question)) return;

  const inputSpecs = getInputSpecsById(question);
  const [factorA, factorB] = getStemFactors(question);
  const decomposition = getDecomposition(question, [factorA, factorB]);
  const solutionCells = question?.solution?.cells || {};
  const rowSums = Array.isArray(question?.solution?.rowSums) ? question.solution.rowSums : [];
  const colSums = Array.isArray(question?.solution?.colSums) ? question.solution.colSums : [];
  const totalSolution = question?.solution?.total;

  const root = createEl('div', 'pvam-widget');
  const header = createEl('div', 'pvam-header');
  const formula = createEl('div', 'pvam-formula', `${factorA} × ${factorB}`);
  const decomp = createEl(
    'div',
    'pvam-decomp',
    `(${decomposition.a[0]} + ${decomposition.a[1]}) × (${decomposition.b[0]} + ${decomposition.b[1]})`
  );
  header.appendChild(formula);
  header.appendChild(decomp);
  root.appendChild(header);

  const decompInputIds = ['decomp_a_0', 'decomp_a_1', 'decomp_b_0', 'decomp_b_1'];
  const showDecompInputs = hasAnyInput(inputSpecs, decompInputIds)
    || question?.taskKind === 'decompose_factors';
  if (showDecompInputs) {
    const decompPanel = createEl('div', 'pvam-sum-panel');
    decompPanel.appendChild(createEl('div', 'pvam-sum-title', '자릿값 분해'));
    appendLabeledInputOrStatic({
      parent: decompPanel,
      label: `${factorA} = 십의 자리`,
      id: 'decomp_a_0',
      inputSpecs,
      value: decomposition.a[0]
    });
    appendLabeledInputOrStatic({
      parent: decompPanel,
      label: `${factorA} = 일의 자리`,
      id: 'decomp_a_1',
      inputSpecs,
      value: decomposition.a[1]
    });
    appendLabeledInputOrStatic({
      parent: decompPanel,
      label: `${factorB} = 십의 자리`,
      id: 'decomp_b_0',
      inputSpecs,
      value: decomposition.b[0]
    });
    appendLabeledInputOrStatic({
      parent: decompPanel,
      label: `${factorB} = 일의 자리`,
      id: 'decomp_b_1',
      inputSpecs,
      value: decomposition.b[1]
    });
    root.appendChild(decompPanel);
  }

  const grid = createEl('div', 'pvam-grid');
  grid.appendChild(createEl('div', 'pvam-axis pvam-axis-corner', '×'));
  grid.appendChild(createEl('div', 'pvam-axis pvam-axis-top', String(decomposition.b[0])));
  grid.appendChild(createEl('div', 'pvam-axis pvam-axis-top', String(decomposition.b[1])));

  const cellDefs = [
    {
      rowLabel: String(decomposition.a[0]),
      cells: [
        { id: 'cell_r0c0', expr: `${decomposition.a[0]} × ${decomposition.b[0]}` },
        { id: 'cell_r0c1', expr: `${decomposition.a[0]} × ${decomposition.b[1]}` }
      ]
    },
    {
      rowLabel: String(decomposition.a[1]),
      cells: [
        { id: 'cell_r1c0', expr: `${decomposition.a[1]} × ${decomposition.b[0]}` },
        { id: 'cell_r1c1', expr: `${decomposition.a[1]} × ${decomposition.b[1]}` }
      ]
    }
  ];

  cellDefs.forEach((row) => {
    grid.appendChild(createEl('div', 'pvam-axis pvam-axis-left', row.rowLabel));
    row.cells.forEach((cell) => {
      const box = createEl('div', 'pvam-cell');
      box.appendChild(createEl('div', 'pvam-cell-expr', cell.expr));
      box.appendChild(createCellInputOrValue({
        id: cell.id,
        inputSpecs,
        solutionValue: solutionCells[cell.id]
      }));
      grid.appendChild(box);
    });
  });

  root.appendChild(grid);

  const rowSumIds = ['row_sum_0', 'row_sum_1'];
  const colSumIds = ['col_sum_0', 'col_sum_1'];
  const showRowSums = hasAnyInput(inputSpecs, rowSumIds) || question?.taskKind === 'partial_sums' || question?.taskKind === 'mixed_process';
  const showColSums = hasAnyInput(inputSpecs, colSumIds) || question?.taskKind === 'partial_sums' || question?.taskKind === 'mixed_process';

  const totals = createEl('div', 'pvam-total-panel');
  if (showRowSums) {
    const rowPanel = createEl('div', 'pvam-sum-panel');
    rowPanel.appendChild(createEl('div', 'pvam-sum-title', '행 부분합'));
    rowSumIds.forEach((id, index) => {
      const row = createEl('div', 'pvam-total-row');
      row.appendChild(createEl('span', 'pvam-total-label', `행 ${index + 1}`));
      if (inputSpecs.has(id)) {
        row.appendChild(createNumberInput({ id, placeholder: '?' }));
      } else {
        row.appendChild(createEl('div', 'pvam-static pvam-total-static', String(rowSums[index] ?? '?')));
      }
      rowPanel.appendChild(row);
    });
    totals.appendChild(rowPanel);
  }
  if (showColSums) {
    const colPanel = createEl('div', 'pvam-sum-panel');
    colPanel.appendChild(createEl('div', 'pvam-sum-title', '열 부분합'));
    colSumIds.forEach((id, index) => {
      const row = createEl('div', 'pvam-total-row');
      row.appendChild(createEl('span', 'pvam-total-label', `열 ${index + 1}`));
      if (inputSpecs.has(id)) {
        row.appendChild(createNumberInput({ id, placeholder: '?' }));
      } else {
        row.appendChild(createEl('div', 'pvam-static pvam-total-static', String(colSums[index] ?? '?')));
      }
      colPanel.appendChild(row);
    });
    totals.appendChild(colPanel);
  }
  const totalRow = createEl('div', 'pvam-total-row');
  totalRow.appendChild(createEl('span', 'pvam-total-label', '최종 곱'));
  if (inputSpecs.has('total')) {
    totalRow.appendChild(createNumberInput({ id: 'total', placeholder: '정답' }));
  } else {
    totalRow.appendChild(createEl('div', 'pvam-static pvam-total-static', String(totalSolution ?? '?')));
  }
  totals.appendChild(totalRow);
  root.appendChild(totals);

  const submitRow = createEl('div', 'pvam-submit-row');
  const hint = createEl('div', 'pvam-submit-hint', '숫자를 입력하고 제출하세요. (Enter 가능)');
  const submitBtn = createEl('button', 'primary pvam-submit-btn', '제출');
  submitBtn.type = 'button';
  submitRow.appendChild(hint);
  submitRow.appendChild(submitBtn);
  root.appendChild(submitRow);

  const collectAnswerInput = () => {
    const payload = {};
    root.querySelectorAll('[data-structured-input]').forEach((input) => {
      const id = input.dataset.structuredInput;
      payload[id] = input.value;
    });
    return payload;
  };

  const submit = () => {
    if (typeof onSubmit !== 'function') return;
    onSubmit(collectAnswerInput());
  };

  submitBtn.addEventListener('click', submit);
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    event.preventDefault();
    submit();
  });

  choicesEl.innerHTML = '';
  choicesEl.classList.add('structured-choices');
  choicesEl.style.removeProperty('height');
  choicesEl.appendChild(root);

  const firstInput = root.querySelector('[data-structured-input]');
  if (firstInput instanceof HTMLInputElement) {
    requestAnimationFrame(() => firstInput.focus());
  }
};
