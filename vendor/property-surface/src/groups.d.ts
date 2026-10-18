export interface FieldGroup { id: string; name: string; fields: string[] }
export function fieldGroups(raw: unknown, acceptsField?: (field: string) => boolean): FieldGroup[];
export function groupedOrder(order: string[], groups: FieldGroup[]): string[];
export function contiguousGroups(keys: string[], groups: FieldGroup[], fieldId?: (key: string) => string): boolean;
