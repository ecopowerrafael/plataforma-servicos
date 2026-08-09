import argon2 from 'argon2';

interface PasswordParameters {
  memoryCost: number;
  timeCost: number;
  parallelism: number;
}

export class PasswordService {
  public constructor(private readonly parameters: PasswordParameters) {}

  public hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: this.parameters.memoryCost,
      timeCost: this.parameters.timeCost,
      parallelism: this.parameters.parallelism,
    });
  }

  public verify(passwordHash: string, password: string): Promise<boolean> {
    return argon2.verify(passwordHash, password);
  }

  public needsRehash(passwordHash: string): boolean {
    return argon2.needsRehash(passwordHash, this.parameters);
  }
}
