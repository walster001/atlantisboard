/** Passport internal registry shape (not in @types/passport). */
export interface PassportWithStrategyRegistry {
  readonly _strategies?: Readonly<Record<string, unknown>>;
}

export function hasPassportStrategy(
  passportInstance: PassportWithStrategyRegistry,
  strategyName: string,
): boolean {
  const strategies = passportInstance._strategies;
  return strategies !== undefined && strategies[strategyName] !== undefined;
}
