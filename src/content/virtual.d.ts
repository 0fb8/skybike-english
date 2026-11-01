declare module "virtual:content" {
  import type { Config, SetEntry } from "./schema";
  export const config: Config;
  export const sets: SetEntry[];
}
