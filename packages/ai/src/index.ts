/**
 * Phase Next-Week2 Day 2 (2026-05-09): @sewmu/ai — OpenAI + 시스템 프롬프트.
 */
export { chatCompletion, extractConfidence } from './openai';
export type { ChatMessage, ChatCompletionOptions, ChatCompletionResult } from './openai';
export { buildSystemPrompt, CORE_RULES } from './system-prompt';
export type { SystemPromptOptions } from './system-prompt';
export { cosine, embedQuery, rankFaqsByEmbedding, formatRagContext } from './rag';
export type { FaqRow, ScoredFaq } from './rag';
