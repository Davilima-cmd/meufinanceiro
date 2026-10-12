/**
 * Validation utilities for Meu Financeiro
 */

export interface ValidationResult<T> {
  success: true;
  data: T;
}

export interface ValidationError {
  success: false;
  errors: string[];
}

export type Result<T> = ValidationResult<T> | ValidationError;

export function success<T>(data: T): ValidationResult<T> {
  return { success: true, data };
}

export function failure(errors: string[]): ValidationError {
  return { success: false, errors };
}

export function validateRequired<T>(value: T | null | undefined, fieldName: string): Result<T> {
  if (value === null || value === undefined) {
    return failure([`${fieldName} is required`]);
  }
  return success(value);
}

export function validateStringLength(
  value: string,
  fieldName: string,
  min: number,
  max: number
): Result<string> {
  if (value.length < min || value.length > max) {
    return failure([`${fieldName} must be between ${min} and ${max} characters`]);
  }
  return success(value);
}

export function validateEmail(email: string): Result<string> {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return failure(['Invalid email format']);
  }
  return success(email);
}

export function combineResults<T>(results: Array<Result<T>>): Result<T[]> {
  const errors = results.flatMap((r) => (r.success ? [] : r.errors));
  if (errors.length > 0) {
    return failure(errors);
  }
  return success(results.map((r) => (r as ValidationResult<T>).data));
}
