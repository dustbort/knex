export function isEqualId(first, second) {
  return first.toLowerCase() === second.toLowerCase();
}

export function includesId(list, id) {
  return list.some((item) => isEqualId(item, id));
}

