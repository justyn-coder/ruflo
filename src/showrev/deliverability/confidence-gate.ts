export type ConfidenceLevel = 'provided' | 'provided-verified' | 'apollo-verified' | 'pattern-derived' | 'clearbit' | 'duckduckgo' | 'unknown';
export type GateColor = 'green' | 'yellow' | 'red';

export interface MVResult {
  quality: 'good' | 'catch_all' | 'bad' | 'disposable' | 'unknown';
  result?: string;
}

export interface ConfidenceEvaluation {
  color: GateColor;
  score: number;
  reasons: string[];
  canSend: boolean;
}

const CONFIDENCE_SCORES: Record<string, number> = {
  'provided-verified': 95,
  'apollo-verified': 90,
  'green': 90,
  'provided': 70,
  'yellow': 70,
  'pattern-derived': 60,
  'amber': 50,
  'clearbit': 50,
  'duckduckgo': 40,
  'red': 20,
  'not-found': 0,
  'unknown': 10,
};

const MV_ADJUSTMENTS: Record<string, number> = {
  'good': 20,
  'catch_all': -10,
  'bad': -60,
  'disposable': -80,
  'unknown': -5,
};

export function evaluateConfidence(
  email: string,
  discoveryMethod: ConfidenceLevel,
  mvResult?: MVResult,
  domainMismatch?: boolean,
): ConfidenceEvaluation {
  const reasons: string[] = [];
  let score = CONFIDENCE_SCORES[discoveryMethod] ?? CONFIDENCE_SCORES.unknown;
  reasons.push(`base: ${discoveryMethod} (${score})`);

  if (mvResult) {
    const adj = MV_ADJUSTMENTS[mvResult.quality] ?? 0;
    score += adj;
    reasons.push(`MV ${mvResult.quality}: ${adj > 0 ? '+' : ''}${adj}`);
  }

  if (domainMismatch) {
    score -= 15;
    reasons.push('domain mismatch: -15');
  }

  if (!email.includes('@') || email.startsWith('pending@')) {
    score = 0;
    reasons.push('invalid or placeholder email');
  }

  score = Math.max(0, Math.min(100, score));

  let color: GateColor;
  if (score >= 70) color = 'green';
  else if (score >= 40) color = 'yellow';
  else color = 'red';

  return {
    color,
    score,
    reasons,
    canSend: color !== 'red',
  };
}
