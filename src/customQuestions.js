// src/customQuestions.js
// "Perguntas da Galera": perguntas enviadas pelos próprios jogadores da
// sala, válidas só durante aquela sessão (não persistem, não têm conta).

const { randomUUID } = require('crypto');

const MIN_LENGTH = 8;
const MAX_LENGTH = 140;
const MAX_PER_ROOM = 40;
const SUBMIT_COOLDOWN_MS = 3000;

function sanitizeText(rawText) {
  return (rawText || '').toString().trim().replace(/\s+/g, ' ');
}

function validateSubmission(room, playerId, rawText) {
  const text = sanitizeText(rawText);

  if (text.length < MIN_LENGTH) {
    return { ok: false, error: `A pergunta precisa ter pelo menos ${MIN_LENGTH} caracteres.` };
  }
  if (text.length > MAX_LENGTH) {
    return { ok: false, error: `A pergunta pode ter no máximo ${MAX_LENGTH} caracteres.` };
  }
  if (room.customQuestions.length >= MAX_PER_ROOM) {
    return { ok: false, error: 'Essa sala já atingiu o limite de perguntas da galera.' };
  }

  const lastSubmit = room.customQuestionRateLimits.get(playerId);
  if (lastSubmit && Date.now() - lastSubmit < SUBMIT_COOLDOWN_MS) {
    return { ok: false, error: 'Calma! Espere um pouquinho antes de mandar outra pergunta.' };
  }

  return { ok: true, text };
}

function addCustomQuestion(room, playerId, authorName, rawText) {
  const validation = validateSubmission(room, playerId, rawText);
  if (!validation.ok) return validation;

  const question = {
    id: `custom-${randomUUID()}`,
    text: validation.text,
    authorName,
    authorId: playerId,
  };

  room.customQuestions.push(question);
  room.customQuestionRateLimits.set(playerId, Date.now());

  return { ok: true, question };
}

function removeCustomQuestion(room, questionId, requesterId, requesterIsHost) {
  const question = room.customQuestions.find((q) => q.id === questionId);
  if (!question) return { ok: false, error: 'Pergunta não encontrada.' };
  if (question.authorId !== requesterId && !requesterIsHost) {
    return { ok: false, error: 'Só quem criou a pergunta (ou o anfitrião) pode removê-la.' };
  }

  room.customQuestions = room.customQuestions.filter((q) => q.id !== questionId);
  return { ok: true };
}

module.exports = {
  MIN_LENGTH, MAX_LENGTH, MAX_PER_ROOM, SUBMIT_COOLDOWN_MS,
  addCustomQuestion, removeCustomQuestion, validateSubmission,
};
