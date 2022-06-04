export function toArray(str: string) {
  return str.split(',').map((address) => {
    return address.trim();
  });
}

export function partialPickWithIndex(n: number, startIndex: number, arr: string[]) {
  const result = [];
  if (n > arr.length) {
    n = arr.length;
  }
  for (let i = 0; i < n; i++) {
    let idx = i + startIndex;
    if (idx > arr.length - 1) {
      idx = idx % arr.length;
    }
    result.push(arr[idx]);
  }
  return result;
}
