export function defaultAvatarFor(input: string): string {
  // simple hash → 0‒48
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash + input.charCodeAt(i)) % 50;
  }
  // avatars are named 01.svg … 50.svg
  const num = (hash + 1).toString().padStart(2, '0');
  return `assets/images/avatars/${num}.svg`;
}
