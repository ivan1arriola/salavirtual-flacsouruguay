export type UsersView = "personas" | "programas";

export function resolveUsersView(value?: string): UsersView {
  return value === "programas" ? "programas" : "personas";
}
