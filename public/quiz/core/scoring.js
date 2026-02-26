export const computeScore = (correct, timeMs, combo, settings) => {
  const { score, timeLimitSec } = settings;

  if (!correct) {
    const penalty = score.penalty > 0 ? -score.penalty : 0;
    return { scoreDelta: penalty, nextCombo: 0 };
  }

  const nextCombo = combo + 1;
  const comboBonus = score.comboEnabled ? score.comboBonus * Math.max(0, nextCombo - 1) : 0;

  let timeBonus = 0;
  if (score.timeBonusEnabled && timeLimitSec > 0 && score.timeBonusPerSec > 0) {
    const remainingSec = Math.max(0, timeLimitSec - timeMs / 1000);
    timeBonus = remainingSec * score.timeBonusPerSec;
    if (score.timeBonusMaxRatio && score.timeBonusMaxRatio > 0) {
      const maxBonus = score.base * (score.timeBonusMaxRatio / 100);
      timeBonus = Math.min(timeBonus, maxBonus);
    }
  }

  const scoreDelta = Math.round(score.base + comboBonus + timeBonus);
  return { scoreDelta, nextCombo };
};
