import {
  success,
  failure,
  validateRequired,
  validateStringLength,
  validateEmail,
  combineResults,
  Result,
} from './index';

describe('validation utilities', () => {
  describe('success', () => {
    it('creates a successful result', () => {
      const result = success('test');
      expect(result).toEqual({ success: true, data: 'test' });
    });
  });

  describe('failure', () => {
    it('creates a failed result', () => {
      const result = failure(['error1', 'error2']);
      expect(result).toEqual({ success: false, errors: ['error1', 'error2'] });
    });
  });

  describe('validateRequired', () => {
    it('returns success for non-null value', () => {
      const result = validateRequired('value', 'field');
      expect(result).toEqual({ success: true, data: 'value' });
    });

    it('returns failure for null', () => {
      const result = validateRequired(null, 'field');
      expect(result).toEqual({ success: false, errors: ['field is required'] });
    });

    it('returns failure for undefined', () => {
      const result = validateRequired(undefined, 'field');
      expect(result).toEqual({ success: false, errors: ['field is required'] });
    });
  });

  describe('validateStringLength', () => {
    it('returns success for valid length', () => {
      const result = validateStringLength('hello', 'field', 3, 10);
      expect(result).toEqual({ success: true, data: 'hello' });
    });

    it('returns failure for too short', () => {
      const result = validateStringLength('hi', 'field', 3, 10);
      expect(result).toEqual({
        success: false,
        errors: ['field must be between 3 and 10 characters'],
      });
    });

    it('returns failure for too long', () => {
      const result = validateStringLength('hello world!', 'field', 3, 10);
      expect(result).toEqual({
        success: false,
        errors: ['field must be between 3 and 10 characters'],
      });
    });
  });

  describe('validateEmail', () => {
    it('returns success for valid email', () => {
      const result = validateEmail('test@example.com');
      expect(result).toEqual({ success: true, data: 'test@example.com' });
    });

    it('returns failure for invalid email', () => {
      const result = validateEmail('invalid-email');
      expect(result).toEqual({ success: false, errors: ['Invalid email format'] });
    });

    it('returns failure for missing domain', () => {
      const result = validateEmail('test@');
      expect(result).toEqual({ success: false, errors: ['Invalid email format'] });
    });
  });

  describe('combineResults', () => {
    it('combines successful results', () => {
      const results: Array<Result<string>> = [success('a'), success('b'), success('c')];
      const combined = combineResults(results);
      expect(combined).toEqual({ success: true, data: ['a', 'b', 'c'] });
    });

    it('collects all errors', () => {
      const results: Array<Result<string>> = [
        failure(['error1']),
        success('b'),
        failure(['error2', 'error3']),
      ];
      const combined = combineResults(results);
      expect(combined).toEqual({
        success: false,
        errors: ['error1', 'error2', 'error3'],
      });
    });

    it('returns success for empty array', () => {
      const combined = combineResults([]);
      expect(combined).toEqual({ success: true, data: [] });
    });
  });
});
