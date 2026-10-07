import { handlePasswordRecoveryUpdate } from "../../../_shared/recovery.ts";
import type { Env } from "../../../_shared/config.ts";
import type { PagesHandler } from "../../../_shared/http.ts";

export const onRequest: PagesHandler<Env> = ({ request, env }) =>
  handlePasswordRecoveryUpdate(request, env);
