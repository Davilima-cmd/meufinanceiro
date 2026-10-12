/**
 * Shared types for Meu Financeiro
 */

export type EntityId = string & { readonly __brand: unique symbol };

export function createEntityId(id: string): EntityId {
  return id as EntityId;
}

export interface Timestamped {
  createdAt: Date;
  updatedAt: Date;
}

export type ISODateString = string & { readonly __brand: unique symbol };

export function toISODateString(date: Date): ISODateString {
  return date.toISOString() as ISODateString;
}
