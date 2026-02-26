export const validateQuestionBank = (bank) => {
  const errors = [];
  if (!bank || !Array.isArray(bank.questions)) {
    return { valid: false, errors: ['questions array is required'] };
  }

  bank.questions.forEach((question, index) => {
    if (!question?.id) errors.push(`questions[${index}].id is required`);
    if (typeof question?.type !== 'string') errors.push(`questions[${index}].type must be string`);
    if (typeof question?.prompt !== 'string') errors.push(`questions[${index}].prompt must be string`);
    if (typeof question?.question !== 'string') errors.push(`questions[${index}].question must be string`);
    if (typeof question?.answer !== 'string') errors.push(`questions[${index}].answer must be string`);
    if (!Array.isArray(question?.choices) || question.choices.length < 2) {
      errors.push(`questions[${index}].choices must be array (length >= 2)`);
    }
    if (Array.isArray(question?.choices) && typeof question?.answer === 'string') {
      if (!question.choices.includes(question.answer)) {
        errors.push(`questions[${index}].answer not in choices`);
      }
    }
  });

  return { valid: errors.length === 0, errors };
};
