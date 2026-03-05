const PVAM_STYLE_LINK_ID = 'pvam-renderer-style';

let pvamStylesEnsured = false;

const ensurePvamRendererStyles = () => {
  if (pvamStylesEnsured) return;
  if (typeof document === 'undefined') {
    pvamStylesEnsured = true;
    return;
  }
  const headEl = document.head || document.getElementsByTagName('head')[0];
  if (!headEl) return;
  if (document.getElementById(PVAM_STYLE_LINK_ID)) {
    pvamStylesEnsured = true;
    return;
  }
  const link = document.createElement('link');
  link.id = PVAM_STYLE_LINK_ID;
  link.rel = 'stylesheet';
  link.href = new URL('./place-value-area-model.css', import.meta.url).toString();
  link.setAttribute('data-pvam-renderer-style', 'true');
  headEl.appendChild(link);
  pvamStylesEnsured = true;
};

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

const addClassTokens = (el, className) => {
  if (!className) return;
  String(className)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
    .forEach((token) => el.classList.add(token));
};

const createNumberInput = ({ id, placeholder }) => {
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'none';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.className = 'pvam-input';
  input.dataset.structuredInput = id;
  input.placeholder = placeholder || '';
  input.setAttribute('aria-label', id);
  return input;
};

const getDigitCountHint = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 1;
  return Math.max(1, String(Math.trunc(Math.abs(num))).length);
};

const createStackDigitInput = ({ id, slotCount }) => {
  const safeSlotCount = Math.max(1, Number(slotCount) || 1);
  const wrapper = createEl('div', 'pvam-stack-digit-input pvam-stack-value');
  wrapper.dataset.stackDigitInput = id;
  wrapper.style.setProperty('--pvam-slot-count', String(safeSlotCount));

  const hiddenInput = createNumberInput({ id, placeholder: '' });
  hiddenInput.classList.add('pvam-stack-value', 'pvam-stack-hidden-input');
  hiddenInput.readOnly = true;
  hiddenInput.inputMode = 'none';
  hiddenInput.tabIndex = -1;
  wrapper.appendChild(hiddenInput);

  const slots = createEl('div', 'pvam-stack-digit-slots');
  for (let index = 0; index < safeSlotCount; index += 1) {
    const slot = createEl('button', 'pvam-stack-digit-slot', '?');
    slot.type = 'button';
    slot.dataset.slotIndex = String(index);
    slots.appendChild(slot);
  }
  wrapper.appendChild(slots);
  return wrapper;
};

const createStackDigitStatic = ({ value, slotCount }) => {
  const safeSlotCount = Math.max(1, Number(slotCount) || 1);
  const wrapper = createEl('div', 'pvam-stack-digit-static pvam-stack-value');
  wrapper.style.setProperty('--pvam-slot-count', String(safeSlotCount));
  const slots = createEl('div', 'pvam-stack-digit-slots');

  const text = canonicalizeDigitText(value);
  const digits = Array(safeSlotCount).fill('');
  if (text) {
    const clipped = text.slice(-safeSlotCount);
    const start = safeSlotCount - clipped.length;
    clipped.split('').forEach((digit, idx) => {
      digits[start + idx] = digit;
    });
  }

  digits.forEach((digit) => {
    const slot = createEl('div', 'pvam-stack-digit-slot is-static', digit || '');
    if (!digit) slot.classList.add('is-empty');
    slots.appendChild(slot);
  });
  wrapper.appendChild(slots);
  return wrapper;
};

const canonicalizeDigitText = (rawText) => {
  const onlyDigits = String(rawText ?? '').replace(/\D+/g, '');
  if (!onlyDigits) return '';
  const normalized = onlyDigits.replace(/^0+(?=\d)/, '');
  return normalized || '0';
};

const compactExpr = (expr) => String(expr || '').replace(/\s*x\s*/gi, 'x');

const sanitizeDisplayValue = (value) => {
  if (value == null) return '';
  const text = String(value).trim();
  if (!text || text === '?') return '';
  return text;
};

const createAnswerSlot = ({ id, inputSpecs, value, className = '', digitCountHint }) => {
  const isStackValue = String(className).includes('pvam-stack-value');
  if (isStackValue) {
    const slotCount = getDigitCountHint(digitCountHint ?? value);
    if (inputSpecs.has(id)) {
      const stackInput = createStackDigitInput({ id, slotCount });
      addClassTokens(stackInput, className);
      return stackInput;
    }
    const stackStatic = createStackDigitStatic({ value, slotCount });
    addClassTokens(stackStatic, className);
    return stackStatic;
  }
  if (inputSpecs.has(id)) {
    const input = createNumberInput({ id, placeholder: '' });
    addClassTokens(input, className);
    return input;
  }
  const staticEl = createEl('div', 'pvam-static', sanitizeDisplayValue(value));
  addClassTokens(staticEl, className);
  return staticEl;
};

const hasAnyInput = (inputSpecs, ids) => ids.some((id) => inputSpecs.has(id));

const createEquationLine = ({
  factor,
  tensValue,
  onesValue,
  tensId,
  onesId,
  inputSpecs
}) => {
  const line = createEl('div', 'pvam-equation');
  line.appendChild(createEl('span', 'pvam-equation-factor', `${factor} = (`));
  line.appendChild(createAnswerSlot({
    id: tensId,
    inputSpecs,
    value: tensValue,
    className: 'pvam-inline-slot'
  }));
  line.appendChild(createEl('span', 'pvam-equation-op', '+'));
  line.appendChild(createAnswerSlot({
    id: onesId,
    inputSpecs,
    value: onesValue,
    className: 'pvam-inline-slot'
  }));
  line.appendChild(createEl('span', 'pvam-equation-op', ')'));
  return line;
};

const createAreaCell = ({
  id,
  expr,
  value,
  toneClass,
  inputSpecs,
  hideValue = false
}) => {
  const cell = createEl('div', `pvam-area-cell ${toneClass}`);
  cell.appendChild(createEl('div', 'pvam-area-expr', expr));
  if (hideValue) {
    const hiddenValue = createEl('div', 'pvam-static pvam-area-value pvam-area-value-hidden', '');
    cell.appendChild(hiddenValue);
  } else {
    cell.appendChild(createAnswerSlot({
      id,
      inputSpecs,
      value,
      className: 'pvam-area-value'
    }));
  }
  return cell;
};

const createStackRow = ({ id, value, note, hintText, toneClass, inputSpecs }) => {
  const row = createEl('div', `pvam-stack-row ${toneClass}`);
  const hint = createEl(
    'div',
    `pvam-stack-row-hint${hintText ? '' : ' is-empty'}`,
    hintText ? `${compactExpr(hintText)}=` : ''
  );
  row.appendChild(hint);
  row.appendChild(createAnswerSlot({
    id,
    inputSpecs,
    value,
    className: 'pvam-stack-value',
    digitCountHint: value
  }));
  if (note) row.dataset.note = note;
  return row;
};

const appendExtraSumRow = ({ parent, label, id, value, inputSpecs }) => {
  const row = createEl('div', 'pvam-extra-row');
  row.appendChild(createEl('div', 'pvam-extra-label', label));
  row.appendChild(createAnswerSlot({
    id,
    inputSpecs,
    value,
    className: 'pvam-extra-value'
  }));
  parent.appendChild(row);
};

const appendLegacyCellRow = ({ parent, label, id, value, inputSpecs }) => {
  const row = createEl('div', 'pvam-extra-row');
  row.appendChild(createEl('div', 'pvam-extra-label', label));
  row.appendChild(createAnswerSlot({
    id,
    inputSpecs,
    value,
    className: 'pvam-extra-value'
  }));
  parent.appendChild(row);
};

const createStackLegendItem = ({ label, expr, toneClass = '' }) => {
  const item = createEl('div', 'pvam-stack-legend-item');
  item.appendChild(createEl('span', 'pvam-stack-legend-label', label));
  if (expr) {
    item.appendChild(createEl('span', `pvam-stack-legend-expr ${toneClass}`.trim(), expr));
  }
  return item;
};

export const isPlaceValueAreaModelQuestion = (question) => (
  question?.interactionKind === 'structured'
  && question?.questionKind === 'place_value_area_model'
);

export const renderPlaceValueAreaModelQuestion = ({ choicesEl, question, onSubmit }) => {
  if (!choicesEl || !isPlaceValueAreaModelQuestion(question)) return;
  ensurePvamRendererStyles();

  const inputSpecs = getInputSpecsById(question);
  const [factorA, factorB] = getStemFactors(question);
  const decomposition = getDecomposition(question, [factorA, factorB]);
  const solutionCells = question?.solution?.cells || {};
  const rowSums = Array.isArray(question?.solution?.rowSums) ? question.solution.rowSums : [];
  const colSums = Array.isArray(question?.solution?.colSums) ? question.solution.colSums : [];
  const totalSolution = question?.solution?.total;
  const answerInputIds = new Set((question?.answerSpec?.inputs || []).map((input) => String(input?.id || '').trim()));

  const b0 = decomposition.b[0];
  const b1 = decomposition.b[1];
  const part0 = b0;
  const part1 = b1;
  const sideFactor = factorA;
  const expr0 = `${factorA} × ${part0}`;
  const expr1 = `${factorA} × ${part1}`;
  const part0Size = Math.max(0, Number(part0) || 0);
  const part1Size = Math.max(0, Number(part1) || 0);
  const areaParts = [
    {
      axisLabel: String(part0),
      id: 'row_sum_0',
      expr: expr0,
      value: rowSums[0],
      toneClass: 'pvam-tone-yellow',
      size: part0Size
    },
    {
      axisLabel: String(part1),
      id: 'row_sum_1',
      expr: expr1,
      value: rowSums[1],
      toneClass: 'pvam-tone-blue',
      size: part1Size
    }
  ];
  const visibleAreaParts = areaParts.filter((part) => part.size > 0);
  const renderedAreaParts = visibleAreaParts.length ? visibleAreaParts : [areaParts[0]];
  const totalPartSize = Math.max(1, renderedAreaParts.reduce((sum, part) => sum + part.size, 0));
  const decompIds = ['decomp_a_0', 'decomp_a_1', 'decomp_b_0', 'decomp_b_1'];
  const showDecompSection = hasAnyInput(inputSpecs, decompIds);

  const root = createEl('div', 'pvam-widget');

  if (showDecompSection) {
    const equations = createEl('div', 'pvam-equations');
    equations.appendChild(createEl('div', 'pvam-equations-title', '곱셈과 넓이'));
    equations.appendChild(createEquationLine({
      factor: factorA,
      tensValue: decomposition.a[0],
      onesValue: decomposition.a[1],
      tensId: 'decomp_a_0',
      onesId: 'decomp_a_1',
      inputSpecs
    }));
    equations.appendChild(createEquationLine({
      factor: factorB,
      tensValue: decomposition.b[0],
      onesValue: decomposition.b[1],
      tensId: 'decomp_b_0',
      onesId: 'decomp_b_1',
      inputSpecs
    }));
    root.appendChild(equations);
  }

  const workRow = createEl('div', 'pvam-work-row');
  const getVisibleRootWidth = () => {
    const rootRect = root.getBoundingClientRect();
    const viewportWidth = Math.max(1, Number(window.innerWidth) || 1);
    const clientWidth = Math.max(1, root.clientWidth || viewportWidth);
    return Math.max(220, Math.min(clientWidth, viewportWidth - Math.max(0, rootRect.left)));
  };
  const isTallLayout = () => {
    const w = Math.max(1, Number(window.innerWidth) || 1);
    const h = Math.max(1, Number(window.innerHeight) || 1);
    return h / w >= 1.15;
  };
  const getSplitProfile = (visibleWidth) => {
    if (visibleWidth <= 240) return 6;
    if (visibleWidth <= 300) return 5;
    if (visibleWidth <= 380) return 4;
    if (visibleWidth <= 560) return 3;
    if (visibleWidth <= 980) return 2;
    return 1;
  };
  const applyLayoutMode = () => {
    const visibleWidth = getVisibleRootWidth();
    const splitProfile = getSplitProfile(visibleWidth);
    const stacked = isTallLayout() || splitProfile >= 2;
    workRow.classList.toggle('pvam-layout-stacked', stacked);
    workRow.classList.toggle('pvam-layout-narrow', stacked && visibleWidth <= 560);
    workRow.classList.toggle('pvam-layout-compact', stacked && visibleWidth <= 430);
    [2, 3, 4, 5, 6].forEach((count) => {
      workRow.classList.toggle(`pvam-split-${count}`, stacked && splitProfile === count);
    });
    return stacked;
  };

  const areaPanel = createEl('section', 'pvam-area-panel');
  areaPanel.appendChild(createEl('div', 'pvam-panel-title', '영역 모델 채우기 (2분할)'));

  const areaStage = createEl('div', 'pvam-area-stage');
  const colTemplate = renderedAreaParts
    .map((part) => `${Math.max(1, part.size)}fr`)
    .join(' ');

  const topAxis = createEl('div', 'pvam-top-axis');
  topAxis.style.gridTemplateColumns = colTemplate;
  renderedAreaParts.forEach((part) => {
    topAxis.appendChild(createEl('div', 'pvam-axis-label pvam-axis-label-top', part.axisLabel));
  });
  areaStage.appendChild(topAxis);

  const boardLine = createEl('div', 'pvam-board-line');
  const board = createEl('div', 'pvam-area-board');
  board.style.gridTemplateColumns = colTemplate;
  board.style.gridTemplateRows = '1fr';

  const areaCells = [];
  renderedAreaParts.forEach((part) => {
    const cell = createAreaCell({
      id: part.id,
      expr: part.expr,
      value: part.value,
      toneClass: part.toneClass,
      inputSpecs,
      hideValue: answerInputIds.has(part.id)
    });
    areaCells.push({ part, cell });
    board.appendChild(cell);
  });
  boardLine.appendChild(board);
  areaStage.appendChild(boardLine);

  const sideAxis = createEl('div', 'pvam-side-axis');
  sideAxis.style.gridTemplateRows = '1fr';
  sideAxis.appendChild(createEl('div', 'pvam-axis-label pvam-axis-label-side', String(sideFactor)));
  areaStage.appendChild(sideAxis);

  const fitUnitAndSize = ({ cols, rows, maxWidth, maxHeight, minUnit = 1, maxUnit = 28 }) => {
    const safeCols = Math.max(1, cols);
    const safeRows = Math.max(1, rows);
    const safeMaxWidth = Math.max(1, maxWidth);
    const safeMaxHeight = Math.max(1, maxHeight);
    let unit = Math.min(safeMaxWidth / safeCols, safeMaxHeight / safeRows);
    unit = Math.max(minUnit, Math.min(maxUnit, unit));
    const width = Math.max(1, Math.round(safeCols * unit));
    const height = Math.max(1, Math.round(safeRows * unit));
    return {
      unit,
      width,
      height,
      area: width * height
    };
  };

  let deferredInlineRelayout = false;
  const updateAreaBoardLayout = () => {
    const stacked = applyLayoutMode();
    const totalCols = totalPartSize;
    const totalRows = Math.max(1, Number(sideFactor) || 0);
    const availableWidth = Math.max(160, (boardLine.clientWidth || 0) - 2);
    const maxBoardWidth = stacked
      ? Math.min(availableWidth, 520)
      : availableWidth;
    const viewportHeight = Math.max(480, window.innerHeight || 0);
    const maxBoardHeight = stacked
      ? Math.min(420, Math.max(120, Math.floor(viewportHeight * 0.34)))
      : Math.min(680, Math.max(180, Math.floor(viewportHeight * 0.58)));
    const boardFit = fitUnitAndSize({
      cols: totalCols,
      rows: totalRows,
      maxWidth: maxBoardWidth,
      maxHeight: maxBoardHeight,
      minUnit: 1,
      maxUnit: 28
    });
    const unit = boardFit.unit;
    const boardWidth = boardFit.width;
    const boardHeight = boardFit.height;

    board.style.width = `${boardWidth}px`;
    board.style.height = `${boardHeight}px`;
    board.style.setProperty('--pvam-unit', `${unit}px`);
    topAxis.style.width = `${boardWidth}px`;

    const compactThreshold = 84;
    areaCells.forEach(({ part, cell }) => {
      const width = boardWidth * (Math.max(1, part.size) / totalCols);
      cell.classList.toggle('is-compact', width < compactThreshold);
    });

    const inlineWidthCandidates = [
      stackInlineBoardWrap.clientWidth || 0,
      stackInlineBody.clientWidth || 0,
      stackInlineArea.clientWidth || 0
    ].filter((value) => value > 0);
    const inlineWidthSource = inlineWidthCandidates.length
      ? Math.min(...inlineWidthCandidates)
      : (stacked ? 0 : (boardLine.clientWidth || 0));
    const inlineAvailableWidth = Math.max(76, inlineWidthSource - 4);
    const inlineMaxHeight = stacked
      ? Math.min(420, Math.max(120, Math.floor((window.innerHeight || 0) * 0.48)))
      : 260;
    const normalFit = fitUnitAndSize({
      cols: totalCols,
      rows: totalRows,
      maxWidth: inlineAvailableWidth,
      maxHeight: inlineMaxHeight,
      minUnit: 1,
      maxUnit: 20
    });
    const transposedFit = fitUnitAndSize({
      cols: totalRows,
      rows: totalCols,
      maxWidth: inlineAvailableWidth,
      maxHeight: inlineMaxHeight,
      minUnit: 1,
      maxUnit: 20
    });
    const prefersTransposedShape = stacked && totalCols > totalRows;
    const shouldTransposeInline = stacked && (
      prefersTransposedShape || (transposedFit.area > normalFit.area * 1.05)
    );
    const inlineCols = shouldTransposeInline ? totalRows : totalCols;
    const inlineRows = shouldTransposeInline ? totalCols : totalRows;
    const selectedInlineFit = shouldTransposeInline ? transposedFit : normalFit;

    stackInlineArea.classList.toggle('is-transposed', shouldTransposeInline);
    stackInlineBoard.style.gridTemplateColumns = shouldTransposeInline ? '1fr' : colTemplate;
    stackInlineBoard.style.gridTemplateRows = shouldTransposeInline ? colTemplate : '1fr';

    stackInlineTop.replaceChildren();
    if (shouldTransposeInline) {
      stackInlineTop.style.gridTemplateColumns = '1fr';
      stackInlineTop.appendChild(createEl('div', 'pvam-stack-inline-axis', String(sideFactor)));
    } else {
      stackInlineTop.style.gridTemplateColumns = colTemplate;
      renderedAreaParts.forEach((part) => {
        stackInlineTop.appendChild(createEl('div', 'pvam-stack-inline-axis', part.axisLabel));
      });
    }

    stackInlineSide.replaceChildren();
    if (shouldTransposeInline) {
      stackInlineSide.classList.toggle('is-segmented', renderedAreaParts.length > 1);
      stackInlineSide.style.gridTemplateRows = colTemplate;
      renderedAreaParts.forEach((part) => {
        stackInlineSide.appendChild(createEl('div', 'pvam-stack-inline-side-label', part.axisLabel));
      });
    } else {
      stackInlineSide.classList.remove('is-segmented');
      stackInlineSide.style.gridTemplateRows = '1fr';
      stackInlineSide.appendChild(createEl('div', 'pvam-stack-inline-side-label', String(sideFactor)));
    }

    const inlineUnit = selectedInlineFit.unit;
    const inlineWidth = selectedInlineFit.width;
    const inlineHeight = selectedInlineFit.height;
    stackInlineBoard.style.width = `${inlineWidth}px`;
    stackInlineBoard.style.height = `${inlineHeight}px`;
    stackInlineBoard.style.setProperty('--pvam-inline-unit', `${inlineUnit}px`);
    stackInlineTop.style.width = `${inlineWidth}px`;
    stackInlineBody.style.height = `${inlineHeight}px`;
    stackInlineSide.style.height = `${inlineHeight}px`;

    if (stacked && inlineWidthSource < 80 && !deferredInlineRelayout) {
      deferredInlineRelayout = true;
      requestAnimationFrame(() => {
        deferredInlineRelayout = false;
        updateAreaBoardLayout();
      });
    }
  };

  areaPanel.appendChild(areaStage);
  workRow.appendChild(areaPanel);

  const verticalPanel = createEl('section', 'pvam-vertical-panel');
  verticalPanel.appendChild(createEl('div', 'pvam-panel-title', '세로셈 완성하기'));
  const stackGrid = createEl('div', 'pvam-stack-grid');
  const stackInlineArea = createEl('div', 'pvam-stack-inline-area');
  const stackInlineTop = createEl('div', 'pvam-stack-inline-top');
  stackInlineArea.appendChild(stackInlineTop);

  const stackInlineBody = createEl('div', 'pvam-stack-inline-body');
  const stackInlineBoardWrap = createEl('div', 'pvam-stack-inline-board-wrap');
  const stackInlineBoard = createEl('div', 'pvam-stack-inline-board');
  const stackInlineSide = createEl('div', 'pvam-stack-inline-side');
  renderedAreaParts.forEach((part) => {
    const cell = createEl('div', `pvam-stack-inline-cell ${part.toneClass}`);
    stackInlineBoard.appendChild(cell);
  });
  stackInlineBoardWrap.appendChild(stackInlineBoard);
  stackInlineBody.appendChild(stackInlineBoardWrap);
  stackInlineBody.appendChild(stackInlineSide);
  stackInlineArea.appendChild(stackInlineBody);

  const stackInlineLegend = createEl('div', 'pvam-stack-inline-legend');
  stackInlineLegend.appendChild(createEl('div', 'pvam-stack-inline-legend-item pvam-tone-yellow', expr0));
  stackInlineLegend.appendChild(createEl('div', 'pvam-stack-inline-legend-item pvam-tone-blue', expr1));
  stackInlineArea.appendChild(stackInlineLegend);
  stackGrid.appendChild(stackInlineArea);

  const stackFrame = createEl('div', 'pvam-stack-frame');
  stackFrame.appendChild(createEl('div', 'pvam-stack-factor', String(factorA)));
  stackFrame.appendChild(createEl('div', 'pvam-stack-factor', `× ${factorB}`));
  stackFrame.appendChild(createEl('div', 'pvam-stack-line'));

  stackFrame.appendChild(createStackRow({
    id: 'row_sum_1',
    value: rowSums[1],
    hintText: expr1,
    note: expr1,
    toneClass: 'pvam-tone-blue',
    inputSpecs
  }));
  stackFrame.appendChild(createStackRow({
    id: 'row_sum_0',
    value: rowSums[0],
    hintText: expr0,
    note: expr0,
    toneClass: 'pvam-tone-yellow',
    inputSpecs
  }));

  stackFrame.appendChild(createEl('div', 'pvam-stack-line'));
  stackFrame.appendChild(createStackRow({
    id: 'total',
    value: totalSolution,
    hintText: `${factorA}x${factorB}`,
    note: '최종 곱',
    toneClass: 'pvam-tone-total',
    inputSpecs
  }));
  stackGrid.appendChild(stackFrame);
  verticalPanel.appendChild(stackGrid);

  const stackLegend = createEl('div', 'pvam-stack-legend');
  stackLegend.appendChild(createStackLegendItem({
    label: '부분곱(일의 자리): ',
    expr: expr1,
    toneClass: 'pvam-tone-blue'
  }));
  stackLegend.appendChild(createStackLegendItem({
    label: '부분곱(십의 자리): ',
    expr: expr0,
    toneClass: 'pvam-tone-yellow'
  }));
  stackLegend.appendChild(createEl('div', 'pvam-stack-legend-item', '최종 곱: 두 부분곱을 더한 값'));
  verticalPanel.appendChild(stackLegend);

  const colSumIds = ['col_sum_0', 'col_sum_1'];
  const hasColSumInput = hasAnyInput(inputSpecs, colSumIds);
  if (hasColSumInput) {
    const extraPanel = createEl('div', 'pvam-extra-sums');
    extraPanel.appendChild(createEl('div', 'pvam-extra-title', '추가 부분합 채우기'));
    appendExtraSumRow({
      parent: extraPanel,
      label: '열 1 부분합',
      id: 'col_sum_0',
      value: colSums[0],
      inputSpecs
    });
    appendExtraSumRow({
      parent: extraPanel,
      label: '열 2 부분합',
      id: 'col_sum_1',
      value: colSums[1],
      inputSpecs
    });
    verticalPanel.appendChild(extraPanel);
  }

  const legacyCellIds = ['cell_r0c0', 'cell_r0c1', 'cell_r1c0', 'cell_r1c1'];
  if (hasAnyInput(inputSpecs, legacyCellIds)) {
    const legacyPanel = createEl('div', 'pvam-extra-sums');
    legacyPanel.appendChild(createEl('div', 'pvam-extra-title', '세부 분해값(기존 형식 호환)'));
    appendLegacyCellRow({
      parent: legacyPanel,
      label: '세부 1',
      id: 'cell_r0c0',
      value: solutionCells.cell_r0c0,
      inputSpecs
    });
    appendLegacyCellRow({
      parent: legacyPanel,
      label: '세부 2',
      id: 'cell_r0c1',
      value: solutionCells.cell_r0c1,
      inputSpecs
    });
    appendLegacyCellRow({
      parent: legacyPanel,
      label: '세부 3',
      id: 'cell_r1c0',
      value: solutionCells.cell_r1c0,
      inputSpecs
    });
    appendLegacyCellRow({
      parent: legacyPanel,
      label: '세부 4',
      id: 'cell_r1c1',
      value: solutionCells.cell_r1c1,
      inputSpecs
    });
    verticalPanel.appendChild(legacyPanel);
  }

  workRow.appendChild(verticalPanel);
  root.appendChild(workRow);

  const structuredInputs = Array.from(root.querySelectorAll('[data-structured-input]'))
    .filter((node) => node instanceof HTMLInputElement);
  const stackInputMeta = new Map();
  let activeInput = null;
  let openKeypadPopup = () => {};
  const isTouchPrimary = (
    (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches)
    || (typeof navigator !== 'undefined' && Number(navigator.maxTouchPoints || 0) > 0)
  );

  const getStackMeta = (input) => stackInputMeta.get(input) || null;

  const getNextPlaceIndex = (meta) => {
    for (let idx = meta.digits.length - 1; idx >= 0; idx -= 1) {
      if (!meta.digits[idx]) return idx;
    }
    return 0;
  };

  const clampSlotIndex = (meta, index) => {
    const max = Math.max(0, meta.digits.length - 1);
    return Math.max(0, Math.min(max, Number(index) || 0));
  };

  const hasEmptySlots = (meta) => meta.digits.some((digit) => !digit);

  const syncStackInputValue = (input, meta) => {
    const digitText = canonicalizeDigitText(meta.digits.join(''));
    input.value = digitText;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const refreshStackInputUi = (input, meta) => {
    const isActive = input === activeInput;
    meta.wrapper.classList.toggle('pvam-active-input', isActive);
    meta.wrapper.classList.toggle('is-correct', input.classList.contains('is-correct'));
    meta.wrapper.classList.toggle('is-wrong', input.classList.contains('is-wrong'));
    meta.slots.forEach((slot, index) => {
      const digit = meta.digits[index];
      slot.textContent = digit || '?';
      slot.classList.toggle('is-empty', !digit);
      slot.classList.toggle('is-active-slot', isActive && index === meta.activeIndex);
    });
  };

  const initStackInputMeta = () => {
    let maxSlots = 0;
    root.querySelectorAll('[data-stack-digit-input], .pvam-stack-digit-static').forEach((wrapper) => {
      if (!(wrapper instanceof HTMLElement)) return;
      const allSlots = Array.from(wrapper.querySelectorAll('.pvam-stack-digit-slot'));
      if (!allSlots.length) return;

      const slotCount = allSlots.length;
      maxSlots = Math.max(maxSlots, slotCount);

      const hiddenInput = wrapper.querySelector('input[data-structured-input]');
      if (!(hiddenInput instanceof HTMLInputElement)) return;

      const slots = allSlots.filter((node) => node instanceof HTMLButtonElement);
      if (!slots.length) return;

      const digits = Array(slotCount).fill('');
      const initialText = String(hiddenInput.value || '').replace(/\D+/g, '').slice(-slotCount);
      if (initialText) {
        const start = slotCount - initialText.length;
        initialText.split('').forEach((char, idx) => {
          digits[start + idx] = char;
        });
      }

      const initialActiveIndex = getNextPlaceIndex({ digits });
      const meta = {
        wrapper,
        slots,
        digits,
        activeIndex: initialActiveIndex
      };
      stackInputMeta.set(hiddenInput, meta);
      refreshStackInputUi(hiddenInput, meta);
      syncStackInputValue(hiddenInput, meta);

      slots.forEach((slot) => {
        slot.addEventListener('click', (event) => {
          event.preventDefault();
          // Keep the exact tapped place so users can edit any digit directly.
          setActiveInput(hiddenInput, { slotIndex: slots.indexOf(slot) });
        });
      });

      const classSync = new MutationObserver(() => {
        refreshStackInputUi(hiddenInput, meta);
      });
      classSync.observe(hiddenInput, { attributes: true, attributeFilter: ['class'] });
    });

    if (maxSlots > 0) {
      stackFrame.style.setProperty('--pvam-place-cols', String(maxSlots));
    }
  };

  const writeDigitToActive = (digitChar) => {
    if (!(activeInput instanceof HTMLInputElement)) {
      if (!structuredInputs.length) return;
      setActiveInput(structuredInputs[0]);
    }
    if (!(activeInput instanceof HTMLInputElement)) return;
    const stackMeta = getStackMeta(activeInput);
    if (!stackMeta) {
      const base = activeInput.value || '';
      activeInput.value = `${base}${digitChar}`;
      activeInput.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const idx = clampSlotIndex(stackMeta, stackMeta.activeIndex);
    stackMeta.digits[idx] = digitChar;
    if (hasEmptySlots(stackMeta)) {
      // After overwrite, jump to the next still-empty place.
      stackMeta.activeIndex = getNextPlaceIndex(stackMeta);
    } else {
      stackMeta.activeIndex = idx;
    }
    syncStackInputValue(activeInput, stackMeta);
    refreshStackInputUi(activeInput, stackMeta);
  };

  const backspaceActive = () => {
    if (!(activeInput instanceof HTMLInputElement)) return;
    const stackMeta = getStackMeta(activeInput);
    if (!stackMeta) {
      activeInput.value = String(activeInput.value || '').slice(0, -1);
      activeInput.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const idx = clampSlotIndex(stackMeta, stackMeta.activeIndex);
    // Backspace clears only the current place.
    stackMeta.digits[idx] = '';
    stackMeta.activeIndex = idx;
    syncStackInputValue(activeInput, stackMeta);
    refreshStackInputUi(activeInput, stackMeta);
  };

  const clearActiveValue = () => {
    if (!(activeInput instanceof HTMLInputElement)) return;
    const stackMeta = getStackMeta(activeInput);
    if (!stackMeta) {
      activeInput.value = '';
      activeInput.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    stackMeta.digits.fill('');
    stackMeta.activeIndex = stackMeta.digits.length - 1;
    syncStackInputValue(activeInput, stackMeta);
    refreshStackInputUi(activeInput, stackMeta);
  };

  const setActiveInput = (input, options = {}) => {
    if (!(input instanceof HTMLInputElement)) return;
    structuredInputs.forEach((el) => {
      el.classList.remove('pvam-active-input');
      const meta = getStackMeta(el);
      if (meta) refreshStackInputUi(el, meta);
    });
    activeInput = input;
    activeInput.classList.add('pvam-active-input');
    const activeMeta = getStackMeta(activeInput);
    if (activeMeta) {
      if (Number.isFinite(Number(options?.slotIndex))) {
        activeMeta.activeIndex = clampSlotIndex(activeMeta, Number(options.slotIndex));
      } else if (options?.preserveSlot !== true) {
        activeMeta.activeIndex = getNextPlaceIndex(activeMeta);
      }
      refreshStackInputUi(activeInput, activeMeta);
    }
    try {
      activeInput.focus({ preventScroll: true });
    } catch (_error) {
      activeInput.focus();
    }
    openKeypadPopup(true);
  };

  const moveToNextInput = () => {
    if (!structuredInputs.length) return;
    if (!(activeInput instanceof HTMLInputElement)) {
      setActiveInput(structuredInputs[0]);
      return;
    }
    const nowIndex = structuredInputs.indexOf(activeInput);
    const nextIndex = nowIndex >= 0 ? (nowIndex + 1) % structuredInputs.length : 0;
    setActiveInput(structuredInputs[nextIndex]);
  };

  initStackInputMeta();
  structuredInputs.forEach((input) => {
    if (getStackMeta(input)) {
      input.readOnly = true;
      input.inputMode = 'none';
      input.addEventListener('focus', () => setActiveInput(input));
      return;
    }
    if (isTouchPrimary) {
      input.readOnly = true;
      input.inputMode = 'none';
    } else {
      input.readOnly = false;
      input.inputMode = 'numeric';
    }
    input.addEventListener('focus', () => setActiveInput(input));
    input.addEventListener('pointerdown', () => setActiveInput(input));
  });

  if (structuredInputs.length) {
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const keypadPopup = createEl('div', 'pvam-keypad-popup hidden');
    const keypadHeader = createEl('div', 'pvam-keypad-popup-header');
    const keypadTitle = createEl('div', 'pvam-keypad-popup-title', '숫자 키패드');
    const keypadTools = createEl('div', 'pvam-keypad-popup-tools');
    const sizeDownBtn = createEl('button', 'pvam-keypad-tool', '−');
    const sizeUpBtn = createEl('button', 'pvam-keypad-tool', '+');
    const closeBtn = createEl('button', 'pvam-keypad-tool', '닫기');
    [sizeDownBtn, sizeUpBtn, closeBtn].forEach((btn) => {
      btn.type = 'button';
    });
    sizeDownBtn.dataset.action = 'size-down';
    sizeUpBtn.dataset.action = 'size-up';
    closeBtn.dataset.action = 'close';
    keypadTools.appendChild(sizeDownBtn);
    keypadTools.appendChild(sizeUpBtn);
    keypadTools.appendChild(closeBtn);
    keypadHeader.appendChild(keypadTitle);
    keypadHeader.appendChild(keypadTools);

    const keypad = createEl('div', 'pvam-keypad');
    const keypadGrid = createEl('div', 'pvam-keypad-grid');
    keypad.appendChild(keypadGrid);
    keypadPopup.appendChild(keypadHeader);
    keypadPopup.appendChild(keypad);

    const keypadButtons = [
      { label: '0', action: 'digit', value: '0' },
      { label: '1', action: 'digit', value: '1' },
      { label: '2', action: 'digit', value: '2' },
      { label: '3', action: 'digit', value: '3' },
      { label: '4', action: 'digit', value: '4' },
      { label: '5', action: 'digit', value: '5' },
      { label: '6', action: 'digit', value: '6' },
      { label: '7', action: 'digit', value: '7' },
      { label: '8', action: 'digit', value: '8' },
      { label: '9', action: 'digit', value: '9' },
      { label: '←', action: 'backspace' },
      { label: '지움', action: 'clear' },
      { label: '다음칸', action: 'next', wide: true },
      { label: '제출', action: 'submit' }
    ];

    const keypadButtonMap = new Map();
    keypadButtons.forEach(({ label, action, value, wide }) => {
      const submitClass = action === 'submit' ? ' is-submit' : '';
      const btn = createEl('button', `pvam-keypad-btn${wide ? ' is-next' : ''}${submitClass}`, label);
      btn.type = 'button';
      btn.dataset.action = action;
      if (value != null) btn.dataset.value = value;
      keypadButtonMap.set(label, btn);
    });

    const getDigitOrderForCols = () => (
      Array.from({ length: 10 }, (_unused, n) => String(n))
    );

    const reorderKeypadButtons = (cols) => {
      const safeCols = Math.max(1, Number(cols) || 1);
      const digits = getDigitOrderForCols(safeCols);
      const controls = ['←', '지움', '다음칸', '제출'];
      const ordered = [];

      for (let index = 0; index < digits.length; index += safeCols) {
        ordered.push(...digits.slice(index, index + safeCols));
      }
      ordered.push(...controls);
      keypadGrid.replaceChildren(...ordered.map((label) => keypadButtonMap.get(label)));
    };
    reorderKeypadButtons(5);

    keypadGrid.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const action = String(target.dataset.action || '');
      if (!action) return;
      if (action === 'digit') {
        const value = String(target.dataset.value || '');
        if (!value) return;
        writeDigitToActive(value);
        return;
      }
      if (action === 'backspace') {
        backspaceActive();
        return;
      }
      if (action === 'clear') {
        clearActiveValue();
        return;
      }
      if (action === 'next') {
        moveToNextInput();
        return;
      }
      if (action === 'submit') {
        submit();
      }
    });

    let userMoved = false;
    let userResized = false;
    const getVisibleBounds = () => {
      const rootRect = root.getBoundingClientRect();
      const visibleWidth = Math.max(
        220,
        Math.min(
          root.clientWidth,
          window.innerWidth - Math.max(0, rootRect.left)
        )
      );
      const visibleHeight = Math.max(
        180,
        window.innerHeight - Math.max(0, rootRect.top)
      );
      return { visibleWidth, visibleHeight };
    };

    const setPopupPosition = (left, top, options = {}) => {
      const allowOverflowBottom = Boolean(options.allowOverflowBottom);
      const popupWidth = keypadPopup.offsetWidth || 340;
      const popupHeight = keypadPopup.offsetHeight || 260;
      const { visibleWidth, visibleHeight } = getVisibleBounds();
      const maxLeft = Math.max(10, visibleWidth - popupWidth - 10);
      const maxTop = Math.max(10, visibleHeight - popupHeight - 10);
      const placedLeft = clamp(left, 10, maxLeft);
      const placedTop = allowOverflowBottom ? Math.max(10, top) : clamp(top, 10, maxTop);
      keypadPopup.style.left = `${placedLeft}px`;
      keypadPopup.style.top = `${placedTop}px`;
    };

    const getLocalRect = (element) => {
      if (!(element instanceof HTMLElement)) return null;
      const rootRect = root.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left - rootRect.left,
        right: rect.right - rootRect.left,
        top: rect.top - rootRect.top,
        bottom: rect.bottom - rootRect.top
      };
    };

    const getActiveRect = () => {
      if (!(activeInput instanceof HTMLInputElement)) return null;
      const meta = getStackMeta(activeInput);
      if (meta?.slots?.length) {
        const slotIndex = Math.max(0, Math.min(meta.slots.length - 1, meta.activeIndex));
        const slotRect = getLocalRect(meta.slots[slotIndex]);
        if (slotRect) return slotRect;
      }
      return getLocalRect(activeInput?.closest?.('.pvam-stack-digit-input') || activeInput);
    };

    const overlapArea = (a, b) => {
      if (!a || !b) return 0;
      const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      return overlapX * overlapY;
    };

    const setPopupModeDocked = () => {
      keypadPopup.classList.add('is-docked');
      keypadPopup.classList.remove('is-floating');
      keypadPopup.style.left = '';
      keypadPopup.style.top = '';
    };

    const setPopupModeFloating = () => {
      keypadPopup.classList.remove('is-docked');
      keypadPopup.classList.add('is-floating');
    };

    const getViewportLayoutFlags = () => {
      const { visibleWidth, visibleHeight } = getVisibleBounds();
      const stacked = workRow.classList.contains('pvam-layout-stacked');
      const useVertical2 = false;
      return { visibleWidth, visibleHeight, stacked, useVertical2 };
    };

    const getKeypadSizeBounds = () => {
      const { stacked } = getViewportLayoutFlags();
      if (stacked) {
        return { minWidth: 150, maxWidth: 520 };
      }
      return { minWidth: 220, maxWidth: 680 };
    };

    const getKeypadLayout = (popupWidth) => {
      if (popupWidth >= 280) {
        return { cols: 9, nextSpan: 2, layout: 'wide' };
      }
      if (popupWidth >= 220) {
        return { cols: 5, nextSpan: 2, layout: 'compact' };
      }
      if (popupWidth >= 176) {
        return { cols: 3, nextSpan: 3, layout: 'compact3' };
      }
      if (popupWidth >= 138) {
        return { cols: 2, nextSpan: 2, layout: 'compact2' };
      }
      return { cols: 1, nextSpan: 1, layout: 'compact1' };
    };

    const applyKeypadDensity = (popupWidthHint = null) => {
      const baseWidth = popupWidthHint || keypadPopup.offsetWidth || 320;
      const { minWidth, maxWidth } = getKeypadSizeBounds();
      const popupWidth = clamp(baseWidth, minWidth, maxWidth);
      const { cols, nextSpan, layout } = getKeypadLayout(popupWidth);
      reorderKeypadButtons(cols);
      const totalCells = (keypadButtons.length - 1) + Math.max(1, nextSpan);
      const rows = Math.max(1, Math.ceil(totalCells / cols));
      keypadPopup.style.minWidth = `${minWidth}px`;
      keypadPopup.style.maxWidth = `${maxWidth}px`;
      keypadPopup.style.setProperty('--pvam-keypad-cols', String(cols));
      keypadPopup.style.setProperty('--pvam-next-span', String(nextSpan));
      keypadPopup.dataset.keypadCols = String(cols);
      keypadPopup.dataset.keypadRows = String(rows);
      keypadPopup.dataset.keypadLayout = String(layout || 'compact');
      return { cols, nextSpan, rows };
    };

    const autoSizePopup = () => {
      if (userResized) {
        applyKeypadDensity();
        return;
      }
      const { visibleWidth, stacked } = getViewportLayoutFlags();
      const { minWidth, maxWidth } = getKeypadSizeBounds();
      const rootWidth = Math.max(300, visibleWidth || root.clientWidth || window.innerWidth || 300);
      const availableWidth = clamp(visibleWidth - 20, minWidth, maxWidth);
      const targetWidth = stacked
        ? visibleWidth >= 1000
          ? clamp(Math.round(visibleWidth * 0.44), 320, 540)
          : visibleWidth >= 720
            ? clamp(Math.round(visibleWidth * 0.56), 280, 500)
            : clamp(Math.round(visibleWidth * 0.86), 220, 420)
        : rootWidth >= 1200
          ? clamp(Math.round(rootWidth * 0.58), 560, 680)
          : rootWidth >= 820
            ? clamp(Math.round(rootWidth * 0.62), 500, 640)
            : clamp(Math.round(rootWidth * 0.94), 280, 520);
      const appliedWidth = clamp(targetWidth, minWidth, availableWidth);
      keypadPopup.style.width = `${appliedWidth}px`;
      applyKeypadDensity(appliedWidth);
    };

    const evaluateCandidate = ({ left, top }, protectedRects) => {
      const popupWidth = keypadPopup.offsetWidth || 340;
      const popupHeight = keypadPopup.offsetHeight || 260;
      const { visibleWidth, visibleHeight } = getVisibleBounds();
      const maxLeft = Math.max(10, visibleWidth - popupWidth - 10);
      const maxTop = Math.max(10, visibleHeight - popupHeight - 10);
      const placedLeft = clamp(left, 10, maxLeft);
      const placedTop = clamp(top, 10, maxTop);
      const rect = {
        left: placedLeft,
        top: placedTop,
        right: placedLeft + popupWidth,
        bottom: placedTop + popupHeight
      };
      const overlap = protectedRects.reduce((sum, protectedRect) => sum + overlapArea(rect, protectedRect), 0);
      return { left: placedLeft, top: placedTop, overlap };
    };

    const placeKeypadSafely = () => {
      autoSizePopup();
      setPopupModeFloating();
      const workRect = getLocalRect(workRow);
      const areaRect = getLocalRect(areaPanel);
      const verticalRect = getLocalRect(verticalPanel);
      const areaProtectedRect = getLocalRect(areaStage) || areaRect;
      const verticalProtectedRect = getLocalRect(stackGrid) || verticalRect;
      const stackInlineRect = getLocalRect(stackInlineArea);
      const stackFrameRect = getLocalRect(stackFrame);
      const activeRect = getActiveRect();
      const popupWidth = keypadPopup.offsetWidth || 340;
      const popupHeight = keypadPopup.offsetHeight || 260;
      const { stacked } = getViewportLayoutFlags();
      const protectedRects = stacked
        ? [stackFrameRect].filter(Boolean)
        : [areaProtectedRect, verticalProtectedRect].filter(Boolean);

      const centerLeft = (root.clientWidth - popupWidth) / 2;
      const workTop = workRect?.top ?? 10;
      const workBottom = workRect?.bottom ?? (root.clientHeight * 0.6);
      const areaLeft = areaRect?.left ?? 10;
      const areaRight = areaRect?.right ?? (root.clientWidth - 10);
      const verticalLeft = verticalRect?.left ?? (root.clientWidth * 0.55);
      const verticalRight = verticalRect?.right ?? (root.clientWidth - 10);

      const candidates = [];
      if (activeRect) {
        setPopupModeFloating();
        const preferredTop = activeRect.bottom + 8;
        const targetTop = preferredTop;
        let targetLeft = activeRect.left + ((activeRect.right - activeRect.left - popupWidth) / 2);
        if (stacked) {
          const preferredRect = stackInlineRect || areaRect || workRect;
          const areaCoverLeft = (preferredRect?.left ?? 10) + 6;
          const areaCoverRight = (preferredRect?.right ?? (root.clientWidth - 10)) - popupWidth - 6;
          targetLeft = Math.max(areaCoverLeft, Math.min(targetLeft, Math.max(areaCoverLeft, areaCoverRight)));
        }
        // Always keep popup under the active answer slot, even when it extends below viewport.
        setPopupPosition(targetLeft, targetTop, { allowOverflowBottom: true });
        return;
      }
      if (stacked) {
        const inlineLeft = stackInlineRect?.left ?? areaLeft;
        const inlineRight = stackInlineRect?.right ?? areaRight;
        const inlineTop = stackInlineRect?.top ?? workTop;
        const inlineBottom = stackInlineRect?.bottom ?? workBottom;
        const safeLeft = Math.max(10, inlineLeft + 6);
        const safeRight = Math.max(10, inlineRight - popupWidth - 6);
        const belowInlineTop = inlineBottom + 8;
        const aboveInlineTop = Math.max(10, inlineTop - popupHeight - 8);
        // Prefer covering the area-model side if needed, avoid the long multiplication frame.
        candidates.push(
          { left: safeLeft, top: belowInlineTop },
          { left: safeRight, top: belowInlineTop },
          { left: safeLeft, top: aboveInlineTop },
          { left: safeRight, top: aboveInlineTop }
        );
      }
      candidates.push(
        { left: areaLeft + 8, top: workBottom + 10 },
        { left: centerLeft, top: workBottom + 10 },
        { left: Math.max(10, areaRight - popupWidth - 8), top: workBottom + 10 },
        { left: 10, top: workBottom + 10 },
        { left: root.clientWidth - popupWidth - 10, top: workBottom + 10 },
        { left: 10, top: workTop - popupHeight - 10 },
        { left: centerLeft, top: workTop - popupHeight - 10 },
        { left: root.clientWidth - popupWidth - 10, top: workTop - popupHeight - 10 },
        { left: areaLeft + 10, top: 10 },
        { left: Math.max(10, verticalLeft - popupWidth - 10), top: 10 },
        { left: Math.min(root.clientWidth - popupWidth - 10, verticalRight + 10), top: 10 }
      );

      let best = null;
      candidates.forEach((candidate) => {
        const scored = evaluateCandidate(candidate, protectedRects);
        if (!best || scored.overlap < best.overlap) {
          best = scored;
        }
      });

      if (!best) {
        setPopupModeDocked();
        keypadPopup.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return;
      }
      if (!stacked && best.overlap > 2) {
        setPopupModeDocked();
        keypadPopup.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return;
      }
      setPopupModeFloating();
      setPopupPosition(best.left, best.top);
    };

    let dragState = null;
    const stopDrag = () => {
      dragState = null;
    };
    const onDragMove = (event) => {
      if (!dragState) return;
      const nextLeft = event.clientX - dragState.offsetX;
      const nextTop = event.clientY - dragState.offsetY;
      setPopupPosition(nextLeft, nextTop);
    };
    keypadHeader.addEventListener('pointerdown', (event) => {
      if (keypadPopup.classList.contains('is-docked')) return;
      const target = event.target;
      if (target instanceof HTMLButtonElement) return;
      const rect = keypadPopup.getBoundingClientRect();
      dragState = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top
      };
      userMoved = true;
      keypadHeader.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    keypadHeader.addEventListener('pointerup', stopDrag);
    keypadHeader.addEventListener('pointercancel', stopDrag);
    keypadHeader.addEventListener('lostpointercapture', stopDrag);
    keypadHeader.addEventListener('pointermove', onDragMove);

    keypadTools.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const action = String(target.dataset.action || '');
      if (!action) return;
      if (action === 'close') {
        keypadPopup.classList.add('hidden');
        return;
      }
      const currentWidth = keypadPopup.offsetWidth || 340;
      const { minWidth, maxWidth } = getKeypadSizeBounds();
      if (action === 'size-down') {
        keypadPopup.style.width = `${clamp(currentWidth - 30, minWidth, maxWidth)}px`;
      } else if (action === 'size-up') {
        keypadPopup.style.width = `${clamp(currentWidth + 30, minWidth, maxWidth)}px`;
      }
      userResized = true;
      userMoved = true;
      applyKeypadDensity();
      requestAnimationFrame(() => {
        if (keypadPopup.classList.contains('is-docked')) return;
        const rect = keypadPopup.getBoundingClientRect();
        const rootRect = root.getBoundingClientRect();
        setPopupPosition(rect.left - rootRect.left, rect.top - rootRect.top);
      });
    });

    openKeypadPopup = (forceRelocate = false) => {
      if (!keypadPopup.parentElement) return;
      const wasHidden = keypadPopup.classList.contains('hidden');
      keypadPopup.classList.remove('hidden');
      if (forceRelocate || wasHidden || !userMoved || keypadPopup.classList.contains('is-docked')) {
        requestAnimationFrame(() => {
          placeKeypadSafely();
        });
      }
    };

    root.appendChild(keypadPopup);

    const onViewportResize = () => {
      if (keypadPopup.classList.contains('hidden')) return;
      requestAnimationFrame(() => {
        placeKeypadSafely();
      });
    };
    window.addEventListener('resize', onViewportResize);
  }

  const submitRow = createEl('div', 'pvam-submit-row');
  const hint = createEl('div', 'pvam-submit-hint', '숫자키패드 또는 키보드로 입력 후 제출하세요.');
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
    if (activeInput instanceof HTMLInputElement && getStackMeta(activeInput)) {
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        writeDigitToActive(event.key);
        return;
      }
      if (event.key === 'Backspace') {
        event.preventDefault();
        backspaceActive();
        return;
      }
      if (event.key === 'Delete') {
        event.preventDefault();
        clearActiveValue();
        return;
      }
    }
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
  requestAnimationFrame(() => {
    updateAreaBoardLayout();
    requestAnimationFrame(() => {
      updateAreaBoardLayout();
    });
  });
};
