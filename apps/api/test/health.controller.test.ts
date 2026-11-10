import { describe, expect, it } from 'vitest';
import { HealthController } from '../src/health.controller';

describe('health endpoint', () => {
  it('reports a successful status', () => {
    expect(new HealthController().getHealth()).toEqual({ status: 'ok' });
  });
});
