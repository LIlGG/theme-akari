export function findInScope<ElementType extends HTMLElement>(
  scope: ParentNode,
  selector: string,
) {
  if (scope instanceof HTMLElement && scope.matches(selector)) {
    return scope as ElementType;
  }
  return scope.querySelector<ElementType>(selector);
}

export function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}
