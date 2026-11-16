export type ValidationIssue = {
  path: ReadonlyArray<string | number>;
  message: string;
};

export type ValidationResult<Value> =
  { success: true; data: Value } | { success: false; issues: readonly ValidationIssue[] };
