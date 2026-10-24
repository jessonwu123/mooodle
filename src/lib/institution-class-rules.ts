export function isInstitutionClass(kind: string | null | undefined) { return kind === "institution_class"; }
export function canCreateStudentLogin(kind: string | null | undefined) { return !isInstitutionClass(kind); }
export function institutionClassKey(name: string) { return name.trim(); }