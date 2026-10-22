import type { ComponentType } from 'react';
import { Listen, Match, Order, Quiz, Sounds } from './games';
import { Learn, Move, Story, Think, Words } from './simple';
import { Talk } from './talk';
import type { StepProps } from './types';

/** Step key (from stepsFor) → screen. */
export const STEPS: Record<string, ComponentType<StepProps>> = {
  story: Story, learn: Learn, words: Words, sounds: Sounds, listen: Listen, match: Match, order: Order, talk: Talk, quiz: Quiz, move: Move, think: Think,
};
