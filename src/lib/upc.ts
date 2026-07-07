function randomDigits(count: number) {
  let out = '';
  for (let i = 0; i < count; i += 1) out += Math.floor(Math.random() * 10).toString();
  return out;
}

// UPC-A: 12 digits, last is check digit.
export function generateUpcA(): string {
  const base11 = randomDigits(11);
  const digits = base11.split('').map((digit) => Number(digit));
  const oddSum = digits.filter((_, idx) => idx % 2 === 0).reduce((a, b) => a + b, 0);
  const evenSum = digits.filter((_, idx) => idx % 2 === 1).reduce((a, b) => a + b, 0);
  const total = oddSum * 3 + evenSum;
  const check = (10 - (total % 10)) % 10;
  return `${base11}${check}`;
}
