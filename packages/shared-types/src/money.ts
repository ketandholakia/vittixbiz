import { Decimal } from 'decimal.js';

export class Money {
  private readonly amount: Decimal;

  constructor(amount: string | number | Decimal | Money) {
    if (typeof amount === 'number') {
      throw new Error('Money cannot be initialized from a raw number to prevent floating-point inaccuracies. Pass a string instead.');
    }
    if (amount instanceof Money) {
      this.amount = amount.amount;
    } else {
      this.amount = new Decimal(amount);
    }
  }

  public add(other: Money): Money {
    return new Money(this.amount.plus(other.amount));
  }

  public subtract(other: Money): Money {
    return new Money(this.amount.minus(other.amount));
  }

  public multiply(multiplier: string | Decimal): Money {
    return new Money(this.amount.times(multiplier));
  }

  public divide(divisor: string | Decimal): Money {
    return new Money(this.amount.dividedBy(divisor));
  }

  public toString(): string {
    return this.amount.toFixed(2);
  }

  public toJSON(): string {
    return this.toString();
  }
}
