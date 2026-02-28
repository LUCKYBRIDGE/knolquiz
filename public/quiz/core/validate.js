export const validateQuestionBank = (bank) => {
  const errors = [];
  if (!bank || !Array.isArray(bank.questions)) {
    return { valid: false, errors: ['questions array is required'] };
  }

  const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

  const validateQuestionTimeLimitSec = (question, index) => {
    if (question?.timeLimitSec == null || question.timeLimitSec === '') return;
    const value = Number(question.timeLimitSec);
    if (!Number.isFinite(value) || value < 0) {
      errors.push(`questions[${index}].timeLimitSec must be number (>= 0)`);
    }
  };

  const validateLegacyChoiceQuestion = (question, index) => {
    const isShortAnswer = question?.renderKind === 'text_short_answer' || question?.type === 'csv_subjective';
    if (typeof question?.question !== 'string') errors.push(`questions[${index}].question must be string`);
    if (typeof question?.answer !== 'string') errors.push(`questions[${index}].answer must be string`);
    if (isShortAnswer) {
      if (!Array.isArray(question?.acceptedAnswers) || question.acceptedAnswers.length < 1) {
        errors.push(`questions[${index}].acceptedAnswers must be array (length >= 1) for short answer`);
      }
      if (question?.acceptedMatchContains != null && typeof question.acceptedMatchContains !== 'boolean') {
        errors.push(`questions[${index}].acceptedMatchContains must be boolean when provided`);
      }
    } else {
      if (!Array.isArray(question?.choices) || question.choices.length < 2) {
        errors.push(`questions[${index}].choices must be array (length >= 2)`);
      }
      if (Array.isArray(question?.choices) && typeof question?.answer === 'string') {
        if (!question.choices.includes(question.answer)) {
          errors.push(`questions[${index}].answer not in choices`);
        }
      }
    }
    validateQuestionTimeLimitSec(question, index);
  };

  const validateStructuredQuestion = (question, index) => {
    if (question?.schemaVersion !== 2) {
      errors.push(`questions[${index}].schemaVersion must be 2 for structured questions`);
    }
    if (typeof question?.interactionKind !== 'string') {
      errors.push(`questions[${index}].interactionKind must be string`);
    } else if (question.interactionKind !== 'structured') {
      errors.push(`questions[${index}].interactionKind must be "structured"`);
    }
    if (typeof question?.questionKind !== 'string') {
      errors.push(`questions[${index}].questionKind must be string`);
    }
    if (typeof question?.taskKind !== 'string') {
      errors.push(`questions[${index}].taskKind must be string`);
    }
    if (typeof question?.question !== 'string' && !isPlainObject(question?.stem)) {
      errors.push(`questions[${index}] must have string question or object stem`);
    }
    if (!isPlainObject(question?.answerSpec)) {
      errors.push(`questions[${index}].answerSpec must be object`);
    }
    if (!Array.isArray(question?.answerSpec?.inputs) || question.answerSpec.inputs.length < 1) {
      errors.push(`questions[${index}].answerSpec.inputs must be array (length >= 1)`);
    } else {
      question.answerSpec.inputs.forEach((input, inputIndex) => {
        if (typeof input?.id !== 'string' || !input.id.trim()) {
          errors.push(`questions[${index}].answerSpec.inputs[${inputIndex}].id must be non-empty string`);
        }
      });
    }
    if (!isPlainObject(question?.solution)) {
      errors.push(`questions[${index}].solution must be object`);
    }
    if (question?.grading != null && !isPlainObject(question.grading)) {
      errors.push(`questions[${index}].grading must be object when provided`);
    }
    validateQuestionTimeLimitSec(question, index);
  };

  bank.questions.forEach((question, index) => {
    if (!question?.id) errors.push(`questions[${index}].id is required`);
    if (typeof question?.type !== 'string') errors.push(`questions[${index}].type must be string`);
    if (typeof question?.prompt !== 'string') errors.push(`questions[${index}].prompt must be string`);
    const structured = question?.interactionKind === 'structured' || question?.schemaVersion === 2;
    if (structured) {
      validateStructuredQuestion(question, index);
    } else {
      validateLegacyChoiceQuestion(question, index);
    }
  });

  return { valid: errors.length === 0, errors };
};
