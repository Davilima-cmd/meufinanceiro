export type ValidationIssue = {
  path: readonly (string | number)[];
  message: string;
};

export type ValidationResult<Value> =
  { success: true; data: Value } | { success: false; issues: readonly ValidationIssue[] };
