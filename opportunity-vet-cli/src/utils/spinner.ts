import ora, { type Ora } from "ora";

let current: Ora | null = null;

export function startStep(text: string): void {
  if (current) {
    current.succeed();
  }
  current = ora(text).start();
}

export function updateStep(text: string): void {
  if (current) {
    current.text = text;
  }
}

export function succeedStep(text?: string): void {
  if (current) {
    current.succeed(text);
    current = null;
  }
}

export function failStep(text?: string): void {
  if (current) {
    current.fail(text);
    current = null;
  }
}
