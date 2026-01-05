/**
 * Type Guards and Utilities
 * 
 * Utility functions for type checking and safe type narrowing
 */

import { Prisma } from '@prisma/client';

/**
 * Type guard to check if value is an Error instance
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Type guard for Prisma Known Request Error
 */
export function isPrismaKnownRequestError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}

/**
 * Type guard for Prisma Unknown Request Error
 */
export function isPrismaUnknownRequestError(error: unknown): error is Prisma.PrismaClientUnknownRequestError {
  return error instanceof Prisma.PrismaClientUnknownRequestError;
}

/**
 * Type guard for Prisma Rust Panic Error
 */
export function isPrismaRustPanicError(error: unknown): error is Prisma.PrismaClientRustPanicError {
  return error instanceof Prisma.PrismaClientRustPanicError;
}

/**
 * Type guard for Prisma Initialization Error
 */
export function isPrismaInitializationError(error: unknown): error is Prisma.PrismaClientInitializationError {
  return error instanceof Prisma.PrismaClientInitializationError;
}

/**
 * Type guard for Prisma error types (union)
 */
export function isPrismaError(error: unknown): error is Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientUnknownRequestError | Prisma.PrismaClientRustPanicError | Prisma.PrismaClientInitializationError {
  return (
    isPrismaKnownRequestError(error) ||
    isPrismaUnknownRequestError(error) ||
    isPrismaRustPanicError(error) ||
    isPrismaInitializationError(error)
  );
}

/**
 * Type guard for objects with string index signature
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Safely extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) return error.message;
  if (typeof error === 'string') return error;
  if (isRecord(error) && 'message' in error) return String(error.message);
  return 'An unknown error occurred';
}

/**
 * Safely extract error name from unknown error
 */
export function getErrorName(error: unknown): string | undefined {
  if (isError(error)) return error.name;
  if (isRecord(error) && 'name' in error) return String(error.name);
  return undefined;
}

/**
 * Check if error is a Prisma table doesn't exist error (P2021)
 */
export function isTableMissingError(error: unknown): boolean {
  if (isPrismaKnownRequestError(error)) {
    return error.code === 'P2021';
  }
  const errorMessage = getErrorMessage(error);
  return errorMessage.includes('does not exist');
}

