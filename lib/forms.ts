// Shared shapes for forms driven by server actions with useActionState (docs/design/M1.md, Contract).
export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export type FormState<K extends string> = {
  fieldErrors?: FieldErrors<K>;
  formError?: string;
  values?: Partial<Record<K, string>>;
};

export type Parsed<T, K extends string> = { ok: true; value: T } | { ok: false; fieldErrors: FieldErrors<K> };
