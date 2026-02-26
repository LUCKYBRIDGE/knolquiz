export const shuffle = (items) => {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export const buildRandomQueue = (questions) => shuffle(questions);

export const cloneWithShuffledChoices = (question) => ({
  ...question,
  choices: shuffle(question.choices)
});
