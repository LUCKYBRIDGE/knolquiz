export const buildWeightedQuestionBank = (banks, settings) => {
  const parseTypeKey = (key) => {
    if (!key.includes('_')) return { shape: null, type: key };
    const [shape, type] = key.split('_');
    return { shape, type };
  };

  const getShapeKind = (assetPath) => {
    if (!assetPath) return 'unknown';
    if (assetPath.includes('cuboid-') || assetPath.includes('cuboid-bad')) return 'cuboid';
    if (assetPath.includes('cube-') || assetPath.includes('cube-bad')) return 'cube';
    return 'unknown';
  };

  const getQuestionShape = (question) => {
    if (!question) return 'unknown';
    if (Array.isArray(question.tags)) {
      if (question.tags.includes('cube')) return 'cube';
      if (question.tags.includes('cuboid')) return 'cuboid';
    }
    const candidates = [
      question.question,
      question.answer,
      ...(question.choices || [])
    ].filter(Boolean);
    for (const path of candidates) {
      const shape = getShapeKind(path);
      if (shape !== 'unknown') return shape;
    }
    return 'unknown';
  };

  const configs = Object.entries(settings.questionTypes || {}).map(([key, config]) => ({
    key,
    enabled: config.enabled,
    count: Math.max(0, Number(config.count) || 0)
  }));

  let enabled = configs.filter(item => item.enabled && item.count > 0);
  if (enabled.length === 0) {
    enabled = [
      { key: 'cube_facecolor', enabled: true, count: 5 },
      { key: 'cuboid_facecolor', enabled: true, count: 5 }
    ];
  }

  const totalRequested = enabled.reduce((sum, item) => sum + item.count, 0);
  const selected = [];
  const pools = {};

  enabled.forEach(item => {
    const { shape, type } = parseTypeKey(item.key);
    const bank = banks[type];
    if (!bank) return;
    const filtered = shape ? bank.questions.filter((q) => getQuestionShape(q) === shape) : bank.questions;
    pools[item.key] = filtered.slice().sort(() => Math.random() - 0.5);
  });

  let remaining = totalRequested;
  enabled.forEach(({ key, count }) => {
    const pool = pools[key] || [];
    const take = Math.min(count, pool.length);
    selected.push(...pool.slice(0, take));
    pools[key] = pool.slice(take);
    remaining -= take;
  });

  if (remaining > 0) {
    const fallback = Object.values(pools).flat();
    const extra = fallback.slice(0, remaining);
    selected.push(...extra);
    remaining -= extra.length;
  }

  if (remaining > 0 && !settings.avoidRepeat) {
    const all = enabled.flatMap(item => {
      const { shape, type } = parseTypeKey(item.key);
      const bank = banks[type];
      if (!bank) return [];
      return shape ? bank.questions.filter((q) => getQuestionShape(q) === shape) : bank.questions;
    });
    while (remaining > 0 && all.length > 0) {
      selected.push(all[Math.floor(Math.random() * all.length)]);
      remaining -= 1;
    }
  }

  const finalQuestions = settings.selectionMode === 'random'
    ? selected.sort(() => Math.random() - 0.5)
    : selected;

  return { questions: finalQuestions };
};
