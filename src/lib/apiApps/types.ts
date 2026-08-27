/** @doc Ready-made API apps — the user brings their own key and the app works.
 *
 *  Each entry describes one public REST service: where the user gets a key,
 *  how the key is sent, and the real endpoints exposed as assistant tools.
 */
export type ApiAppAuth = {
  type: "header" | "query";
  name: string;
  prefix?: string;
};

export type ApiAppParam = {
  name: string;
  in: "query" | "path" | "body";
  required: boolean;
  description: string;
};

export type ApiAppTool = {
  name: string;
  description: string;
  method: "GET" | "POST";
  path: string;
  params: ApiAppParam[];
};

export type ApiAppCategory =
  | "search"
  | "weather"
  | "media"
  | "finance"
  | "ai"
  | "data"
  | "comms"
  | "dev";

export type ApiApp = {
  id: string;
  name: string;
  category: ApiAppCategory;
  description: string;
  docsUrl: string;
  keyUrl: string;
  baseUrl: string;
  auth: ApiAppAuth;
  logo: string;
  tools: ApiAppTool[];
};
